import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';
import type { StoragePort } from '../../config/storage';
import { UserRepository, toPublicUser, type PublicUser } from './user.repository';
import type { UserDocument, UserRole } from './user.model';

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly storage: StoragePort,
  ) {}

  async getPublicById(id: string): Promise<PublicUser> {
    const user = await this.users.findById(id);
    if (!user || user.status === 'deleted') {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found');
    }
    return toPublicUser(user);
  }

  async requireActiveById(id: string): Promise<UserDocument> {
    const user = await this.users.findById(id);
    if (!user || user.status === 'deleted') {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found');
    }
    if (user.status === 'suspended') {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.ACCOUNT_SUSPENDED, 'Account is suspended');
    }
    return user;
  }

  async updateProfile(userId: string, patch: { name?: string; phone?: string }): Promise<PublicUser> {
    const user = await this.requireActiveById(userId);
    if (patch.phone && patch.phone !== user.phone) {
      const taken = await this.users.findByPhoneExcluding(patch.phone, userId);
      if (taken) {
        throw new AppError(HTTP.CONFLICT, ERROR_CODES.CONFLICT, 'Phone already registered');
      }
      user.phone = patch.phone;
      user.isPhoneVerified = false;
    }
    if (patch.name) user.name = patch.name;
    await this.users.save(user);
    return toPublicUser(user);
  }

  async updateAvatar(userId: string, dataUri: string): Promise<PublicUser> {
    const user = await this.requireActiveById(userId);
    const file = await this.storage.uploadDataUri(dataUri, 'ridex/avatars');
    user.avatarUrl = file.url;
    await this.users.save(user);
    return toPublicUser(user);
  }

  async suspend(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user || user.status === 'deleted') {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found');
    }
    user.status = 'suspended';
    await this.users.save(user);
    return toPublicUser(user);
  }

  async reinstate(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user || user.status === 'deleted') {
      throw new AppError(HTTP.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'User not found');
    }
    user.status = 'active';
    await this.users.save(user);
    return toPublicUser(user);
  }

  assertRole(user: PublicUser, roles: UserRole[]): void {
    if (!roles.includes(user.role)) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Insufficient role');
    }
  }
}
