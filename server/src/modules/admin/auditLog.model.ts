import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export type AuditLogDocument = HydratedDocument<InferSchemaType<typeof auditLogSchema>>;

export const AuditLogModel = model('AuditLog', auditLogSchema);
