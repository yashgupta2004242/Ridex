import { RatingModel, type RatingDocument } from './rating.model';

export class RatingRepository {
  async findByRide(rideId: string): Promise<RatingDocument | null> {
    return RatingModel.findOne({ rideId });
  }

  async create(input: {
    rideId: string;
    fromUserId: string;
    score: number;
    comment: string;
  }): Promise<RatingDocument> {
    return RatingModel.create(input);
  }

  async listByRideIds(rideIds: string[]): Promise<RatingDocument[]> {
    if (rideIds.length === 0) return [];
    return RatingModel.find({ rideId: { $in: rideIds } }).sort({ createdAt: -1 });
  }
}
