import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { VEHICLE_TYPES } from '../driver/driver.model';
import { RIDE_STATUSES } from './rideStateMachine';

const pointSchema = {
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true },
};

const rideSchema = new Schema(
  {
    rideCode: { type: String, required: true, unique: true, index: true },
    riderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    driverId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    pickup: {
      address: { type: String, default: '' },
      location: pointSchema,
    },
    drop: {
      address: { type: String, default: '' },
      location: pointSchema,
    },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    status: { type: String, enum: RIDE_STATUSES, default: 'REQUESTED', index: true },
    fare: {
      base: { type: Number, required: true },
      distance: { type: Number, required: true },
      time: { type: Number, required: true },
      surge: { type: Number, required: true },
      platformFee: { type: Number, required: true },
      tax: { type: Number, required: true },
      total: { type: Number, required: true },
      surgeMultiplier: { type: Number, required: true },
    },
    distanceMeters: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    otpHash: { type: String, default: '' },
    path: [
      {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    ],
    route: [
      {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        at: { type: Date, required: true },
      },
    ],
    timeline: [
      {
        status: { type: String, enum: RIDE_STATUSES, required: true },
        at: { type: Date, required: true },
        by: { type: String, required: true },
      },
    ],
    cancellation: {
      by: { type: String, default: '' },
      reason: { type: String, default: '' },
      fee: { type: Number, default: 0 },
    },
    paymentId: { type: String, default: null },
    summary: { type: String, default: '' },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);

rideSchema.index({ riderId: 1, idempotencyKey: 1 }, { unique: true });
rideSchema.index({ riderId: 1, status: 1 });
rideSchema.index({ driverId: 1, status: 1 });

export type RideDocument = HydratedDocument<InferSchemaType<typeof rideSchema>>;

export const RideModel = model('Ride', rideSchema);
