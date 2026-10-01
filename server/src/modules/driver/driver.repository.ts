import {
  DriverProfileModel,
  type DriverProfileDocument,
  type VehicleType,
  type VerificationStatus,
} from './driver.model';

export class DriverRepository {
  async findByUserId(userId: string): Promise<DriverProfileDocument | null> {
    return DriverProfileModel.findOne({ userId });
  }

  async create(userId: string): Promise<DriverProfileDocument> {
    return DriverProfileModel.create({ userId });
  }

  async save(profile: DriverProfileDocument): Promise<DriverProfileDocument> {
    return profile.save();
  }

  async listByStatus(status: VerificationStatus): Promise<DriverProfileDocument[]> {
    return DriverProfileModel.find({ verificationStatus: status }).sort({ updatedAt: -1 });
  }

  async updateLocation(userId: string, lng: number, lat: number): Promise<void> {
    await DriverProfileModel.updateOne(
      { userId },
      { $set: { currentLocation: { type: 'Point', coordinates: [lng, lat] } } },
    );
  }

  async findMatchable(userIds: string[], vehicleType: VehicleType): Promise<DriverProfileDocument[]> {
    if (userIds.length === 0) return [];
    return DriverProfileModel.find({
      userId: { $in: userIds },
      isOnline: true,
      verificationStatus: 'approved',
      'vehicle.type': vehicleType,
    });
  }
}
