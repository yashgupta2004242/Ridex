import { Types } from 'mongoose';
import { LedgerModel } from './ledger.model';
import { PaymentModel, type PaymentDocument, type PaymentStatus } from './payment.model';
import { WebhookEventModel } from './webhookEvent.model';

export class PaymentRepository {
  async findByRide(rideId: string): Promise<PaymentDocument | null> {
    return PaymentModel.findOne({ rideId });
  }

  async findByOrderId(orderId: string): Promise<PaymentDocument | null> {
    return PaymentModel.findOne({ razorpayOrderId: orderId });
  }

  async findByIdempotency(riderId: string, key: string): Promise<PaymentDocument | null> {
    return PaymentModel.findOne({ riderId, idempotencyKey: key });
  }

  async create(data: Record<string, unknown>): Promise<PaymentDocument> {
    return PaymentModel.create(data);
  }

  async save(payment: PaymentDocument): Promise<PaymentDocument> {
    return payment.save();
  }

  async appendLedger(input: {
    driverId: string;
    rideId?: string;
    type: 'earning' | 'payout' | 'refund_clawback';
    amount: number;
    note: string;
  }) {
    return LedgerModel.create(input);
  }

  async sumLedger(driverId: string): Promise<number> {
    const rows = await LedgerModel.aggregate<{ total: number }>([
      { $match: { driverId: new Types.ObjectId(driverId) } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return rows[0]?.total ?? 0;
  }

  async listLedger(driverId: string, limit = 50) {
    return LedgerModel.find({ driverId }).sort({ createdAt: -1 }).limit(limit);
  }

  async sumEarningsSince(driverId: string, since: Date): Promise<number> {
    const rows = await LedgerModel.aggregate<{ total: number }>([
      {
        $match: {
          driverId: new Types.ObjectId(driverId),
          type: 'earning',
          createdAt: { $gte: since },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return rows[0]?.total ?? 0;
  }

  async countEarnings(driverId: string): Promise<number> {
    return LedgerModel.countDocuments({ driverId, type: 'earning' });
  }

  async unpaidDrivers(): Promise<{ driverId: string; total: number }[]> {
    const rows = await LedgerModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $group: { _id: '$driverId', total: { $sum: '$amount' } } },
      { $match: { total: { $gt: 0 } } },
    ]);
    return rows.map((row) => ({ driverId: row._id.toString(), total: row.total }));
  }

  async markWebhook(eventId: string, event: string): Promise<boolean> {
    try {
      await WebhookEventModel.create({ eventId, event });
      return true;
    } catch {
      return false;
    }
  }

  async capturedTotals(): Promise<{ revenue: number; count: number }> {
    const rows = await PaymentModel.aggregate<{ revenue: number; count: number }>([
      { $match: { status: 'captured' satisfies PaymentStatus } },
      { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    return { revenue: rows[0]?.revenue ?? 0, count: rows[0]?.count ?? 0 };
  }
}
