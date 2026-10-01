import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';
import type { RazorpayPort } from '../../config/razorpay';
import { rupees } from '../pricing/fare';
import { RatingRepository } from '../rating/rating.repository';
import { rideLngLat } from '../ride/ride.coords';
import { RideRepository } from '../ride/ride.repository';
import { PaymentRepository } from './payment.repository';
import type { PaymentDocument, PaymentMethod } from './payment.model';

export type PublicPayment = {
  id: string;
  rideId: string;
  method: string;
  amount: number;
  status: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  keyId?: string;
};

export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly rides: RideRepository,
    private readonly razorpay: RazorpayPort,
    private readonly keyId = '',
    private readonly ratings = new RatingRepository(),
  ) {}

  async create(
    riderId: string,
    rideId: string,
    method: PaymentMethod,
    idempotencyKey: string,
  ): Promise<PublicPayment> {
    const existing = await this.payments.findByIdempotency(riderId, idempotencyKey);
    if (existing) return this.toPublic(existing);
    const byRide = await this.payments.findByRide(rideId);
    if (byRide) return this.toPublic(byRide);

    const ride = await this.rides.findById(rideId);
    if (!ride) throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Ride not found');
    if (ride.riderId.toString() !== riderId) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'This is not your ride');
    }
    if (ride.status !== 'COMPLETED') {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.INVALID_TRANSITION, 'Pay after the trip completes');
    }

    const amount = ride.fare?.total ?? 0;
    if (method === 'cash') {
      const payment = await this.payments.create({
        rideId,
        riderId,
        driverId: ride.driverId,
        method,
        amount,
        status: 'captured',
        idempotencyKey,
      });
      await this.creditDriver(ride.driverId?.toString(), rideId, ride);
      ride.paymentId = payment.id;
      await this.rides.save(ride);
      return this.toPublic(payment);
    }

    if (!this.razorpay.configured) {
      throw new AppError(
        HTTP.SERVICE_UNAVAILABLE,
        ERROR_CODES.RAZORPAY_NOT_CONFIGURED,
        'Online payments are not configured. Pay cash or add Razorpay keys.',
      );
    }
    const order = await this.razorpay.createOrder(Math.round(amount * 100), ride.rideCode);
    const payment = await this.payments.create({
      rideId,
      riderId,
      driverId: ride.driverId,
      method,
      amount,
      status: 'pending',
      razorpayOrderId: order.id,
      idempotencyKey,
    });
    ride.paymentId = payment.id;
    await this.rides.save(ride);
    return this.toPublic(payment);
  }

  async verifyCheckout(
    riderId: string,
    input: { razorpayOrderId: string; razorpayPaymentId: string; signature: string },
  ): Promise<PublicPayment> {
    const payment = await this.payments.findByOrderId(input.razorpayOrderId);
    if (!payment || payment.riderId.toString() !== riderId) {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Payment not found');
    }
    if (!this.razorpay.verifyCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.signature)) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.PAYMENT_FAILED, 'Razorpay signature did not match');
    }
    return this.capture(payment, input.razorpayPaymentId);
  }

  async handleWebhook(rawBody: string, signature: string, payload: WebhookPayload): Promise<{ ok: boolean }> {
    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.PAYMENT_FAILED, 'Webhook signature did not match');
    }
    const eventId = payload.id;
    const first = await this.payments.markWebhook(eventId, payload.event);
    if (!first) return { ok: true };
    const orderId = payload.payload?.payment?.entity?.order_id;
    const paymentId = payload.payload?.payment?.entity?.id;
    if (!orderId) return { ok: true };
    const payment = await this.payments.findByOrderId(orderId);
    if (!payment) return { ok: true };
    if (payload.event === 'payment.captured' && paymentId) {
      await this.capture(payment, paymentId);
    }
    if (payload.event === 'payment.failed') {
      payment.status = 'failed';
      await this.payments.save(payment);
    }
    return { ok: true };
  }

  async refund(actorId: string, rideId: string, reason: string, asAdmin: boolean): Promise<PublicPayment> {
    const payment = await this.payments.findByRide(rideId);
    if (!payment) throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Payment not found');
    if (!asAdmin && payment.riderId.toString() !== actorId) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'This is not your payment');
    }
    if (payment.status !== 'captured') {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.CONFLICT, 'Only captured payments can be refunded');
    }
    payment.status = 'refunded';
    payment.refund = { amount: payment.amount, reason, at: new Date() };
    await this.payments.save(payment);
    if (payment.driverId) {
      await this.payments.appendLedger({
        driverId: payment.driverId.toString(),
        rideId,
        type: 'refund_clawback',
        amount: -this.driverShareFromAmount(payment.amount),
        note: reason,
      });
    }
    return this.toPublic(payment);
  }

  async earnings(driverId: string) {
    const [balance, entries, today, month, paidTrips, completed] = await Promise.all([
      this.payments.sumLedger(driverId),
      this.payments.listLedger(driverId),
      this.payments.sumEarningsSince(driverId, startOfIstDay()),
      this.payments.sumEarningsSince(driverId, startOfIstMonth()),
      this.payments.countEarnings(driverId),
      this.rides.listCompletedByDriver(driverId, 40),
    ]);
    const ratings = await this.ratings.listByRideIds(completed.map((ride) => ride.id));
    const rideById = new Map(completed.map((ride) => [ride.id, ride]));
    return {
      balance: rupees(balance),
      today: rupees(today),
      month: rupees(month),
      paidTrips,
      entries: entries.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        note: row.note,
        rideId: row.rideId ? row.rideId.toString() : null,
        at: row.createdAt ? row.createdAt.toISOString() : '',
      })),
      reviews: ratings.map((row) => {
        const ride = rideById.get(row.rideId.toString());
        return {
          id: row.id,
          rideId: row.rideId.toString(),
          rideCode: ride?.rideCode ?? '',
          score: row.score,
          comment: row.comment,
          at: row.createdAt ? row.createdAt.toISOString() : '',
        };
      }),
      trips: completed.slice(0, 12).map((ride) => {
        const pickup = rideLngLat(ride.pickup);
        const drop = rideLngLat(ride.drop);
        return {
          rideId: ride.id,
          rideCode: ride.rideCode,
          pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
          drop: { address: drop.address, lat: drop.lat, lng: drop.lng },
          path: (ride.path ?? []).map((point) => ({ lat: point.lat, lng: point.lng })),
          fareTotal: ride.fare?.total ?? 0,
        };
      }),
    };
  }

  async runWeeklyPayouts(): Promise<{ drivers: number; paid: number }> {
    const due = await this.payments.unpaidDrivers();
    let paid = 0;
    for (const row of due) {
      await this.payments.appendLedger({
        driverId: row.driverId,
        type: 'payout',
        amount: -row.total,
        note: 'Weekly payout',
      });
      paid += row.total;
    }
    return { drivers: due.length, paid: rupees(paid) };
  }

  async adminStats() {
    return this.payments.capturedTotals();
  }

  private async capture(payment: PaymentDocument, razorpayPaymentId: string): Promise<PublicPayment> {
    if (payment.status === 'captured') return this.toPublic(payment);
    payment.status = 'captured';
    payment.razorpayPaymentId = razorpayPaymentId;
    await this.payments.save(payment);
    const ride = await this.rides.findById(payment.rideId.toString());
    if (ride) await this.creditDriver(ride.driverId?.toString(), ride.id, ride);
    return this.toPublic(payment);
  }

  private async creditDriver(
    driverId: string | undefined,
    rideId: string,
    ride: { fare?: { total?: number; platformFee?: number; tax?: number } | null },
  ): Promise<void> {
    if (!driverId) return;
    const share = this.driverShare(ride);
    if (share <= 0) return;
    await this.payments.appendLedger({
      driverId,
      rideId,
      type: 'earning',
      amount: share,
      note: 'Trip earning',
    });
  }

  private driverShare(ride: { fare?: { total?: number; platformFee?: number; tax?: number } | null }): number {
    return rupees((ride.fare?.total ?? 0) - (ride.fare?.platformFee ?? 0) - (ride.fare?.tax ?? 0));
  }

  private driverShareFromAmount(amount: number): number {
    return rupees(amount * 0.8);
  }

  private toPublic(payment: PaymentDocument): PublicPayment {
    return {
      id: payment.id,
      rideId: payment.rideId.toString(),
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      keyId: this.keyId || undefined,
    };
  }
}

const IST_SHIFT_MS = 5.5 * 60 * 60 * 1000;

function startOfIstDay(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_SHIFT_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_SHIFT_MS);
}

function startOfIstMonth(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_SHIFT_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_SHIFT_MS);
}

export type WebhookPayload = {
  id: string;
  event: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
};

