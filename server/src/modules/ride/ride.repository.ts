import { RideModel, type RideDocument } from './ride.model';
import { ACTIVE_RIDE_STATUSES, type RideStatus, rideStateMachine } from './rideStateMachine';

export class RideRepository {
  async create(data: Record<string, unknown>): Promise<RideDocument> {
    return RideModel.create(data);
  }

  async findById(id: string): Promise<RideDocument | null> {
    return RideModel.findById(id);
  }

  async findByIdempotency(riderId: string, key: string): Promise<RideDocument | null> {
    return RideModel.findOne({ riderId, idempotencyKey: key });
  }

  async save(ride: RideDocument): Promise<RideDocument> {
    return ride.save();
  }

  async findActiveByRider(riderId: string): Promise<RideDocument | null> {
    return RideModel.findOne({ riderId, status: { $in: ACTIVE_RIDE_STATUSES } }).sort({ createdAt: -1 });
  }

  async findActiveByDriver(driverId: string): Promise<RideDocument | null> {
    return RideModel.findOne({ driverId, status: { $in: ACTIVE_RIDE_STATUSES } }).sort({ createdAt: -1 });
  }

  async findActiveByUser(userId: string): Promise<RideDocument | null> {
    return RideModel.findOne({
      $or: [
        { riderId: userId, status: { $in: ACTIVE_RIDE_STATUSES } },
        { driverId: userId, status: { $in: ACTIVE_RIDE_STATUSES } },
      ],
    }).sort({ createdAt: -1 });
  }

  async listBusyDriverIds(driverIds: string[]): Promise<Set<string>> {
    if (driverIds.length === 0) return new Set();
    const rows = await RideModel.find({
      driverId: { $in: driverIds },
      status: { $in: ACTIVE_RIDE_STATUSES },
    }).select('driverId');
    return new Set(rows.map((row) => row.driverId?.toString()).filter((id): id is string => Boolean(id)));
  }

  async claim(rideId: string, driverId: string, at: Date): Promise<RideDocument | null> {
    return RideModel.findOneAndUpdate(
      { _id: rideId, status: 'SEARCHING', driverId: null },
      {
        $set: { driverId, status: 'DRIVER_ASSIGNED' },
        $push: { timeline: { status: 'DRIVER_ASSIGNED' satisfies RideStatus, at, by: driverId } },
      },
      { returnDocument: 'after' },
    );
  }

  apply(ride: RideDocument, to: RideStatus, by: string, at = new Date()): RideDocument {
    rideStateMachine.assert(ride.status as RideStatus, to);
    ride.status = to;
    ride.timeline.push({ status: to, at, by });
    return ride;
  }

  async listByRider(riderId: string, limit = 20): Promise<RideDocument[]> {
    return RideModel.find({ riderId }).sort({ createdAt: -1 }).limit(limit);
  }

  async listLive(): Promise<RideDocument[]> {
    return RideModel.find({ status: { $in: ACTIVE_RIDE_STATUSES } }).sort({ updatedAt: -1 }).limit(100);
  }

  async listDrops(riderId: string, limit = 20): Promise<RideDocument[]> {
    return RideModel.find({ riderId, status: 'COMPLETED' }).sort({ createdAt: -1 }).limit(limit);
  }

  async listCompletedByDriver(driverId: string, limit = 40): Promise<RideDocument[]> {
    return RideModel.find({ driverId, status: 'COMPLETED' }).sort({ createdAt: -1 }).limit(limit);
  }
}
