import { UserModel, type UserDocument, type UserRole, type UserStatus } from './user.model';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  avatarUrl: string | null;
  status: UserStatus;
};

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    avatarUrl: user.avatarUrl,
    status: user.status,
  };
}

export type CreateUserInput = {
  name: string;
  email: string;
  phone: string;
  passwordHash?: string | null;
  googleId?: string | null;
  role: UserRole;
  isEmailVerified?: boolean;
};

export class UserRepository {
  async create(input: CreateUserInput): Promise<UserDocument> {
    return UserModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash ?? null,
      googleId: input.googleId ?? null,
      role: input.role,
      isEmailVerified: input.isEmailVerified ?? false,
      isPhoneVerified: false,
      avatarUrl: null,
      status: 'active',
    });
  }

  async findById(id: string): Promise<UserDocument | null> {
    return UserModel.findById(id);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() });
  }

  async findByPhone(phone: string): Promise<UserDocument | null> {
    return UserModel.findOne({ phone });
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return UserModel.findOne({ googleId });
  }

  async save(user: UserDocument): Promise<UserDocument> {
    return user.save();
  }

  async findByPhoneExcluding(phone: string, userId: string): Promise<UserDocument | null> {
    return UserModel.findOne({ phone, _id: { $ne: userId } });
  }
}
