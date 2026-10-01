import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const ticketSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rideId: { type: Schema.Types.ObjectId, ref: 'Ride', default: null },
    kind: { type: String, enum: ['support', 'sos', 'refund'], default: 'support' },
    message: { type: String, required: true },
    status: { type: String, enum: ['open', 'flagged', 'closed'], default: 'open' },
  },
  { timestamps: true },
);

export type SupportTicketDocument = HydratedDocument<InferSchemaType<typeof ticketSchema>>;
export const SupportTicketModel = model('SupportTicket', ticketSchema);
