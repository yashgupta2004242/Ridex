import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const ledgerSchema = new Schema(
  {
    driverId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rideId: { type: Schema.Types.ObjectId, ref: 'Ride', default: null },
    type: { type: String, enum: ['earning', 'payout', 'refund_clawback'], required: true },
    amount: { type: Number, required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

ledgerSchema.index({ driverId: 1, createdAt: 1 });

export type LedgerDocument = HydratedDocument<InferSchemaType<typeof ledgerSchema>>;
export const LedgerModel = model('DriverLedger', ledgerSchema);
