import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const PAYMENT_METHODS = ['cash', 'upi', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'captured', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const paymentSchema = new Schema(
  {
    rideId: { type: Schema.Types.ObjectId, ref: 'Ride', required: true, unique: true, index: true },
    riderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    driverId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    razorpayOrderId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    amount: { type: Number, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    refund: {
      amount: { type: Number, default: 0 },
      reason: { type: String, default: '' },
      at: { type: Date, default: null },
    },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);

paymentSchema.index({ riderId: 1, idempotencyKey: 1 }, { unique: true });

export type PaymentDocument = HydratedDocument<InferSchemaType<typeof paymentSchema>>;
export const PaymentModel = model('Payment', paymentSchema);
