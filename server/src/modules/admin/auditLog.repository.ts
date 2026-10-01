import { AuditLogModel } from './auditLog.model';

export class AuditLogRepository {
  async create(input: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }) {
    return AuditLogModel.create(input);
  }

  async list(skip: number, limit: number) {
    const [items, total] = await Promise.all([
      AuditLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLogModel.countDocuments(),
    ]);
    return { items, total };
  }
}
