import { randomInt } from 'node:crypto';
import { AppError } from '../../common/AppError';
import {
  CANCEL_FEE_AFTER_MS,
  CANCEL_FEE_RUPEES,
  ERROR_CODES,
  HTTP,
  RIDE_LOCK_TTL_MS,
} from '../../common/constants';
import type { CacheStore } from '../../config/cache';
import type { LockStore } from '../../config/lock';
import type { JobQueue } from '../../jobs/queue';
import { SOCKET_EVENTS } from '../../realtime/events';
import type { RealtimeHub } from '../../realtime/hub';
import type { RideSnapshot, RideSyncPort } from '../../realtime/rideSync';
import { randomToken, sha256, safeEqualHex } from '../auth/crypto';
import type { DriverService } from '../driver/driver.service';
import type { OfferBroker } from '../matching/offerBroker';
import type { PricingService } from '../pricing/pricing.service';
import type { UserService } from '../user/user.service';
import type { CreateRideInput } from './ride.dto';
import type { RideDocument } from './ride.model';
import { rideLngLat } from './ride.coords';
import { RideRepository } from './ride.repository';
import { ACTIVE_RIDE_STATUSES, type RideStatus } from './rideStateMachine';
import { RatingRepository } from '../rating/rating.repository';

export type PublicRide = {
  id: string;
  rideCode: string;
  riderId: string;
  driverId: string | null;
  pickup: { address: string; lat: number; lng: number };
  drop: { address: string; lat: number; lng: number };
  vehicleType: string;
  status: RideStatus;
  fare: RideDocument['fare'];
  distanceMeters: number;
  durationSeconds: number;
  otp: string | null;
  timeline: { status: string; at: string; by: string }[];
  cancellation: { by: string; reason: string; fee: number };
  summary: string;
  path: { lat: number; lng: number }[];
  route: { lat: number; lng: number }[];
};

export class RideService implements RideSyncPort {
  constructor(
    private readonly rides: RideRepository,
    private readonly users: UserService,
    private readonly drivers: DriverService,
    private readonly pricing: PricingService,
    private readonly hub: RealtimeHub,
    private readonly locks: LockStore,
    private readonly cache: CacheStore,
    private readonly jobs: JobQueue,
    private readonly broker: OfferBroker,
    private readonly ratings: RatingRepository,
    private readonly otps = new Map<string, string>(),
  ) {}

  async create(riderId: string, input: CreateRideInput, idempotencyKey: string): Promise<PublicRide> {
    const user = await this.users.requireActiveById(riderId);
    if (user.role !== 'rider') {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Only riders can request a ride');
    }
    const existingKey = await this.rides.findByIdempotency(riderId, idempotencyKey);
    if (existingKey) {
      return this.toPublic(existingKey, riderId);
    }
    const active = await this.rides.findActiveByRider(riderId);
    if (active) {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.CONFLICT, 'You already have an active ride');
    }
    const estimate = await this.pricing.estimate(input);
    const quote = estimate.quotes.find((item) => item.vehicleType === input.vehicleType);
    if (!quote) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Unknown vehicle type');
    }
    const now = new Date();
    try {
      const ride = await this.rides.create({
        rideCode: `RX${randomToken(4).slice(0, 8).toUpperCase()}`,
        riderId,
        driverId: null,
        pickup: {
          address: input.pickup.address ?? '',
          location: { type: 'Point', coordinates: [input.pickup.lng, input.pickup.lat] },
        },
        drop: {
          address: input.drop.address ?? '',
          location: { type: 'Point', coordinates: [input.drop.lng, input.drop.lat] },
        },
        vehicleType: input.vehicleType,
        status: 'SEARCHING',
        fare: {
          base: quote.base,
          distance: quote.distance,
          time: quote.time,
          surge: quote.surge,
          platformFee: quote.platformFee,
          tax: quote.tax,
          total: quote.total,
          surgeMultiplier: quote.surgeMultiplier,
        },
        distanceMeters: estimate.distanceMeters,
        durationSeconds: estimate.durationSeconds,
        otpHash: '',
        path: downsamplePath(estimate.path),
        route: [],
        timeline: [
          { status: 'REQUESTED', at: now, by: riderId },
          { status: 'SEARCHING', at: now, by: 'system' },
        ],
        cancellation: { by: '', reason: '', fee: 0 },
        paymentId: null,
        idempotencyKey,
      });
      await this.jobs.enqueueMatch(ride.id);
      this.hub.emitToUser(riderId, SOCKET_EVENTS.RIDE_STATUS, { rideId: ride.id, status: ride.status });
      return this.toPublic(ride, riderId);
    } catch (error) {
      const duplicate = await this.rides.findByIdempotency(riderId, idempotencyKey);
      if (duplicate) return this.toPublic(duplicate, riderId);
      throw error;
    }
  }

  async get(userId: string, rideId: string): Promise<PublicRide> {
    const ride = await this.requireRide(rideId);
    this.assertParticipant(ride, userId);
    return this.toPublic(ride, userId);
  }

  async getActiveForUser(userId: string): Promise<RideSnapshot | null> {
    const ride = await this.rides.findActiveByUser(userId);
    if (!ride) return null;
    return {
      rideId: ride.id,
      status: ride.status,
      riderId: ride.riderId.toString(),
      driverId: ride.driverId ? ride.driverId.toString() : null,
    };
  }

  async accept(driverId: string, rideId: string): Promise<PublicRide> {
    if (!(await this.drivers.canPing(driverId))) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.DRIVER_NOT_VERIFIED, 'Go online before accepting rides');
    }
    const busy = await this.rides.findActiveByDriver(driverId);
    if (busy) {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.CONFLICT, 'You already have an active ride');
    }
    const token = randomToken(8);
    const lockKey = `lock:ride:${rideId}`;
    const locked = await this.locks.acquire(lockKey, token, RIDE_LOCK_TTL_MS);
    if (!locked) {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.RIDE_TAKEN, 'Another driver already took this ride');
    }
    try {
      const claimed = await this.rides.claim(rideId, driverId, new Date());
      if (!claimed) {
        throw new AppError(HTTP.CONFLICT, ERROR_CODES.RIDE_TAKEN, 'Another driver already took this ride');
      }
      this.broker.resolve(rideId, driverId, 'accepted');
      this.rides.apply(claimed, 'DRIVER_ARRIVING', driverId);
      await this.rides.save(claimed);
      await this.hub.joinRide(claimed.riderId.toString(), claimed.id);
      await this.hub.joinRide(driverId, claimed.id);
      this.hub.emitToRide(claimed.id, SOCKET_EVENTS.RIDE_ACCEPTED, {
        rideId: claimed.id,
        driverId,
      });
      this.hub.emitToRide(claimed.id, SOCKET_EVENTS.RIDE_STATUS, {
        rideId: claimed.id,
        status: claimed.status,
      });
      return this.toPublic(claimed, driverId);
    } finally {
      await this.locks.release(lockKey, token);
    }
  }

  async decline(driverId: string, rideId: string): Promise<{ declined: boolean }> {
    this.broker.resolve(rideId, driverId, 'declined');
    return { declined: true };
  }

  async arrived(driverId: string, rideId: string): Promise<PublicRide> {
    const ride = await this.requireDriverRide(rideId, driverId);
    this.rides.apply(ride, 'DRIVER_ARRIVED', driverId);
    const otp = randomInt(0, 10_000).toString().padStart(4, '0');
    ride.otpHash = sha256(otp);
    this.otps.set(ride.id, otp);
    await this.cache.set(`ride:otp:${ride.id}`, otp, 30 * 60);
    await this.rides.save(ride);
    this.emitStatus(ride);
    return this.toPublic(ride, driverId);
  }

  async start(driverId: string, rideId: string, otp: string): Promise<PublicRide> {
    const ride = await this.requireDriverRide(rideId, driverId);
    if (!ride.otpHash || !safeEqualHex(ride.otpHash, sha256(otp))) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.INVALID_OTP, 'That trip OTP does not match');
    }
    this.rides.apply(ride, 'IN_PROGRESS', driverId);
    await this.rides.save(ride);
    this.emitStatus(ride);
    return this.toPublic(ride, driverId);
  }

  async complete(driverId: string, rideId: string): Promise<PublicRide> {
    const ride = await this.requireDriverRide(rideId, driverId);
    this.rides.apply(ride, 'COMPLETED', driverId);
    await this.rides.save(ride);
    await this.drivers.recordTripComplete(driverId);
    await this.jobs.enqueueReceipt(ride.id);
    this.hub.emitToRide(ride.id, SOCKET_EVENTS.RIDE_COMPLETED, {
      rideId: ride.id,
      fare: ride.fare,
    });
    return this.toPublic(ride, driverId);
  }

  async cancel(userId: string, rideId: string, reason: string): Promise<PublicRide> {
    const ride = await this.requireRide(rideId);
    this.assertParticipant(ride, userId);
    const isDriver = ride.driverId?.toString() === userId;
    const to = isDriver ? 'CANCELLED_BY_DRIVER' : 'CANCELLED_BY_RIDER';
    this.rides.apply(ride, to, userId);
    const assignedAt = ride.timeline.find((item) => item.status === 'DRIVER_ASSIGNED')?.at;
    const fee =
      !isDriver && assignedAt && Date.now() - new Date(assignedAt).getTime() >= CANCEL_FEE_AFTER_MS
        ? CANCEL_FEE_RUPEES
        : 0;
    ride.cancellation = { by: isDriver ? 'driver' : 'rider', reason, fee };
    await this.rides.save(ride);
    if (isDriver) {
      await this.drivers.penalizeCancel(userId);
    }
    this.hub.emitToRide(ride.id, SOCKET_EVENTS.RIDE_CANCELLED, {
      rideId: ride.id,
      by: ride.cancellation.by,
      fee,
    });
    return this.toPublic(ride, userId);
  }

  async recordDriverPing(userId: string, point: { lat: number; lng: number }): Promise<void> {
    const ride = await this.rides.findActiveByDriver(userId);
    if (!ride) return;
    if (!ACTIVE_RIDE_STATUSES.includes(ride.status as RideStatus)) return;
    if (ride.status === 'SEARCHING' || ride.status === 'REQUESTED') return;
    ride.route.push({ lat: point.lat, lng: point.lng, at: new Date() });
    await this.rides.save(ride);
  }

  async rate(userId: string, rideId: string, score: number, comment: string): Promise<{ rated: boolean }> {
    const ride = await this.requireRide(rideId);
    if (ride.riderId.toString() !== userId) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Only the rider can rate this trip');
    }
    if (ride.status !== 'COMPLETED') {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.INVALID_TRANSITION, 'Rate the trip after it completes');
    }
    const existing = await this.ratings.findByRide(rideId);
    if (existing) {
      throw new AppError(HTTP.CONFLICT, ERROR_CODES.CONFLICT, 'This trip is already rated');
    }
    await this.ratings.create({ rideId, fromUserId: userId, score, comment });
    return { rated: true };
  }

  async history(userId: string): Promise<PublicRide[]> {
    const user = await this.users.requireActiveById(userId);
    const rows =
      user.role === 'driver'
        ? await this.rides.listCompletedByDriver(userId)
        : await this.rides.listByRider(userId);
    return Promise.all(rows.map((row) => this.toPublic(row, userId)));
  }

  async liveMap(): Promise<PublicRide[]> {
    const rows = await this.rides.listLive();
    return Promise.all(rows.map((row) => this.toPublic(row, row.riderId.toString())));
  }

  private emitStatus(ride: RideDocument): void {
    this.hub.emitToRide(ride.id, SOCKET_EVENTS.RIDE_STATUS, { rideId: ride.id, status: ride.status });
  }

  private async requireRide(rideId: string): Promise<RideDocument> {
    const ride = await this.rides.findById(rideId);
    if (!ride) {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Ride not found');
    }
    return ride;
  }

  private async requireDriverRide(rideId: string, driverId: string): Promise<RideDocument> {
    const ride = await this.requireRide(rideId);
    if (ride.driverId?.toString() !== driverId) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'This is not your ride');
    }
    return ride;
  }

  private assertParticipant(ride: RideDocument, userId: string): void {
    const rider = ride.riderId.toString() === userId;
    const driver = ride.driverId?.toString() === userId;
    if (!rider && !driver) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'This is not your ride');
    }
  }

  private async toPublic(ride: RideDocument, viewerId: string): Promise<PublicRide> {
    const isRider = ride.riderId.toString() === viewerId;
    const otp = isRider ? (this.otps.get(ride.id) ?? (await this.cache.get(`ride:otp:${ride.id}`))) : null;
    const pickup = rideLngLat(ride.pickup);
    const drop = rideLngLat(ride.drop);
    return {
      id: ride.id,
      rideCode: ride.rideCode,
      riderId: ride.riderId.toString(),
      driverId: ride.driverId ? ride.driverId.toString() : null,
      pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
      drop: { address: drop.address, lat: drop.lat, lng: drop.lng },
      vehicleType: ride.vehicleType,
      status: ride.status as RideStatus,
      fare: ride.fare,
      distanceMeters: ride.distanceMeters,
      durationSeconds: ride.durationSeconds,
      otp,
      timeline: ride.timeline.map((item) => ({
        status: item.status,
        at: new Date(item.at).toISOString(),
        by: item.by,
      })),
      cancellation: {
        by: ride.cancellation?.by ?? '',
        reason: ride.cancellation?.reason ?? '',
        fee: ride.cancellation?.fee ?? 0,
      },
      summary: ride.summary ?? '',
      path: (ride.path ?? []).map((point) => ({ lat: point.lat, lng: point.lng })),
      route: (ride.route ?? []).map((point) => ({ lat: point.lat, lng: point.lng })),
    };
  }
}

function downsamplePath(pairs: [number, number][], max = 160): { lat: number; lng: number }[] {
  if (pairs.length === 0) return [];
  const pick = (pair: [number, number] | undefined) => {
    if (!pair || pair[0] === undefined || pair[1] === undefined) return null;
    return { lng: pair[0], lat: pair[1] };
  };
  if (pairs.length <= max) {
    return pairs.map((pair) => pick(pair)).filter((row): row is { lat: number; lng: number } => Boolean(row));
  }
  const out: { lat: number; lng: number }[] = [];
  const last = pairs.length - 1;
  for (let i = 0; i < max; i += 1) {
    const index = i === max - 1 ? last : Math.round((i * last) / (max - 1));
    const row = pick(pairs[index]);
    if (row) out.push(row);
  }
  return out;
}
