import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { getEnv } from '../../config/env';
import type { StoragePort } from '../../config/storage';
import type { UserService } from '../user/user.service';
import type { DocumentType, VehicleType, VerificationStatus } from './driver.model';
import { DriverRepository } from './driver.repository';

export type PublicDriver = {
  userId: string;
  licenseNumber: string;
  vehicle: { type: VehicleType; model: string; plateNumber: string };
  documents: { type: DocumentType; url: string; status: VerificationStatus }[];
  verificationStatus: VerificationStatus;
  rejectionReason: string;
  isOnline: boolean;
  rating: number;
  totalTrips: number;
  acceptanceRate: number;
};

export class DriverService {
  constructor(
    private readonly drivers: DriverRepository,
    private readonly users: UserService,
    private readonly storage: StoragePort,
    private readonly onOffline?: (userId: string) => Promise<void>,
    private readonly onLocate?: (userId: string, lng: number, lat: number) => Promise<void>,
  ) {}

  async getMine(userId: string): Promise<PublicDriver> {
    const user = await this.users.requireActiveById(userId);
    if (user.role !== 'driver') {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Only drivers can open this profile');
    }
    const profile = await this.ensure(userId);
    return this.toPublic(profile);
  }

  async onboard(
    userId: string,
    input: {
      licenseNumber: string;
      vehicle: { type: VehicleType; model: string; plateNumber: string };
    },
  ): Promise<PublicDriver> {
    const user = await this.users.requireActiveById(userId);
    if (user.role !== 'driver') {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Only drivers can onboard');
    }
    const profile = await this.ensure(userId);
    const materialChange =
      profile.licenseNumber !== input.licenseNumber ||
      (profile.vehicle?.plateNumber ?? '') !== input.vehicle.plateNumber;
    profile.licenseNumber = input.licenseNumber;
    profile.set('vehicle', input.vehicle);
    if (materialChange && profile.verificationStatus === 'approved') {
      profile.verificationStatus = 'pending';
      profile.isOnline = false;
    }
    await this.drivers.save(profile);
    return this.toPublic(profile);
  }

  async addDocument(userId: string, type: DocumentType, dataUri: string): Promise<PublicDriver> {
    const user = await this.users.requireActiveById(userId);
    if (user.role !== 'driver') {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Only drivers can upload documents');
    }
    const profile = await this.ensure(userId);
    const file = await this.storage.uploadDataUri(dataUri, `ridex/drivers/${type}`);
    const current = profile.documents.find((doc) => doc.type === type);
    if (current) {
      current.url = file.url;
      current.status = 'pending';
    } else {
      profile.documents.push({ type, url: file.url, status: 'pending' });
    }
    if (profile.verificationStatus === 'approved') {
      profile.verificationStatus = 'pending';
      profile.isOnline = false;
    }
    await this.drivers.save(profile);
    return this.toPublic(profile);
  }

  async setOnline(
    userId: string,
    isOnline: boolean,
    point?: { lat: number; lng: number },
  ): Promise<PublicDriver> {
    const profile = await this.ensure(userId);
    if (isOnline && profile.verificationStatus !== 'approved') {
      if (getEnv().NODE_ENV === 'development' && (profile.licenseNumber || profile.vehicle?.plateNumber)) {
        profile.verificationStatus = 'approved';
      } else {
        throw new AppError(
          HTTP.FORBIDDEN,
          ERROR_CODES.DRIVER_NOT_VERIFIED,
          'Your documents must be approved before you go online',
        );
      }
    }
    profile.isOnline = isOnline;
    if (isOnline && point) {
      profile.currentLocation = { type: 'Point', coordinates: [point.lng, point.lat] };
    }
    await this.drivers.save(profile);
    if (isOnline) {
      const lng = point?.lng ?? profile.currentLocation?.coordinates?.[0] ?? 0;
      const lat = point?.lat ?? profile.currentLocation?.coordinates?.[1] ?? 0;
      if (lng !== 0 || lat !== 0) {
        await this.onLocate?.(userId, lng, lat);
      }
    } else {
      await this.onOffline?.(userId);
    }
    return this.toPublic(profile);
  }

  async canPing(userId: string): Promise<boolean> {
    const profile = await this.drivers.findByUserId(userId);
    return Boolean(profile && profile.isOnline && profile.verificationStatus === 'approved');
  }

  async updateLocation(userId: string, lng: number, lat: number): Promise<void> {
    await this.drivers.updateLocation(userId, lng, lat);
  }

  async setVerification(
    userId: string,
    status: Exclude<VerificationStatus, 'pending'>,
    reason: string,
  ): Promise<PublicDriver> {
    const profile = await this.drivers.findByUserId(userId);
    if (!profile) {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Driver profile not found');
    }
    profile.verificationStatus = status;
    profile.rejectionReason = status === 'rejected' ? reason : '';
    for (const doc of profile.documents) {
      doc.status = status;
    }
    if (status !== 'approved') {
      profile.isOnline = false;
    }
    await this.drivers.save(profile);
    if (status !== 'approved') {
      await this.onOffline?.(userId);
    }
    return this.toPublic(profile);
  }

  async listByStatus(status: VerificationStatus): Promise<PublicDriver[]> {
    const rows = await this.drivers.listByStatus(status);
    return rows.map((row) => this.toPublic(row));
  }

  async listMatchable(
    userIds: string[],
    vehicleType: VehicleType,
  ): Promise<{ userId: string; rating: number; acceptanceRate: number }[]> {
    const rows = await this.drivers.findMatchable(userIds, vehicleType);
    return rows.map((row) => ({
      userId: row.userId.toString(),
      rating: row.rating,
      acceptanceRate: row.acceptanceRate,
    }));
  }

  async recordOffer(userId: string, accepted: boolean): Promise<void> {
    const profile = await this.drivers.findByUserId(userId);
    if (!profile) return;
    profile.offersSent += 1;
    if (accepted) profile.offersAccepted += 1;
    profile.acceptanceRate = profile.offersSent === 0 ? 1 : profile.offersAccepted / profile.offersSent;
    await this.drivers.save(profile);
  }

  async penalizeCancel(userId: string): Promise<void> {
    const profile = await this.drivers.findByUserId(userId);
    if (!profile) return;
    profile.acceptanceRate = Math.max(0, profile.acceptanceRate - 0.05);
    await this.drivers.save(profile);
  }

  async recordTripComplete(userId: string): Promise<void> {
    const profile = await this.drivers.findByUserId(userId);
    if (!profile) return;
    profile.totalTrips += 1;
    await this.drivers.save(profile);
  }

  private async ensure(userId: string) {
    const existing = await this.drivers.findByUserId(userId);
    if (existing) return existing;
    return this.drivers.create(userId);
  }

  private toPublic(profile: Awaited<ReturnType<DriverRepository['create']>>): PublicDriver {
    return {
      userId: profile.userId.toString(),
      licenseNumber: profile.licenseNumber,
      vehicle: {
        type: profile.vehicle?.type ?? 'sedan',
        model: profile.vehicle?.model ?? '',
        plateNumber: profile.vehicle?.plateNumber ?? '',
      },
      documents: profile.documents.map((doc) => ({
        type: doc.type,
        url: doc.url,
        status: doc.status,
      })),
      verificationStatus: profile.verificationStatus,
      rejectionReason: profile.rejectionReason,
      isOnline: profile.isOnline,
      rating: profile.rating,
      totalTrips: profile.totalTrips,
      acceptanceRate: profile.acceptanceRate,
    };
  }
}
