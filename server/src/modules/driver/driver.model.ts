import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const VEHICLE_TYPES = ['bike', 'auto', 'sedan', 'suv'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const DOCUMENT_TYPES = ['license', 'registration', 'insurance', 'selfie'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const driverProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    licenseNumber: { type: String, default: '', trim: true },
    vehicle: {
      type: { type: String, enum: VEHICLE_TYPES, default: 'sedan' },
      model: { type: String, default: '' },
      plateNumber: { type: String, default: '' },
    },
    documents: [
      {
        type: { type: String, enum: DOCUMENT_TYPES, required: true },
        url: { type: String, required: true },
        status: { type: String, enum: VERIFICATION_STATUSES, default: 'pending' },
      },
    ],
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'pending' },
    rejectionReason: { type: String, default: '' },
    isOnline: { type: Boolean, default: false },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    rating: { type: Number, default: 5 },
    totalTrips: { type: Number, default: 0 },
    acceptanceRate: { type: Number, default: 1 },
    offersSent: { type: Number, default: 0 },
    offersAccepted: { type: Number, default: 0 },
  },
  { timestamps: true },
);

driverProfileSchema.index({ currentLocation: '2dsphere' });

export type DriverProfileDocument = HydratedDocument<InferSchemaType<typeof driverProfileSchema>>;

export const DriverProfileModel = model('DriverProfile', driverProfileSchema);
