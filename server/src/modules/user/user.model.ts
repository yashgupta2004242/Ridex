import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const USER_ROLES = ['rider', 'driver', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: null, index: true },
    role: { type: String, required: true, enum: USER_ROLES },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null },
    status: { type: String, required: true, enum: USER_STATUSES, default: 'active' },
  },
  { timestamps: true },
);

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const UserModel = model('User', userSchema);
