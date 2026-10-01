import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const webhookSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export type WebhookEventDocument = HydratedDocument<InferSchemaType<typeof webhookSchema>>;
export const WebhookEventModel = model('WebhookEvent', webhookSchema);
