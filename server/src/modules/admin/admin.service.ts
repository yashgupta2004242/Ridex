import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';
import type { AuthService } from '../auth/auth.service';
import type { DriverService } from '../driver/driver.service';
import type { UserService } from '../user/user.service';
import { AuditLogRepository } from './auditLog.repository';

export class AdminService {
  constructor(
    private readonly users: UserService,
    private readonly drivers: DriverService,
    private readonly auth: AuthService,
    private readonly audit: AuditLogRepository,
  ) {}

  async verifyDriver(
    actorId: string,
    driverUserId: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) {
    if (decision === 'rejected' && reason.trim().length < 3) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Give a reason when rejecting a driver');
    }
    const profile = await this.drivers.setVerification(driverUserId, decision, reason);
    await this.audit.create({
      actorId,
      action: `driver.${decision}`,
      targetType: 'DriverProfile',
      targetId: driverUserId,
      metadata: { reason },
    });
    return profile;
  }

  async suspendUser(actorId: string, userId: string, reason: string) {
    if (actorId === userId) {
      throw new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'You cannot suspend your own account');
    }
    const user = await this.users.suspend(userId);
    await this.auth.logoutAll(userId);
    await this.audit.create({
      actorId,
      action: 'user.suspended',
      targetType: 'User',
      targetId: userId,
      metadata: { reason },
    });
    return user;
  }

  async reinstateUser(actorId: string, userId: string) {
    const user = await this.users.reinstate(userId);
    await this.audit.create({
      actorId,
      action: 'user.reinstated',
      targetType: 'User',
      targetId: userId,
      metadata: {},
    });
    return user;
  }

  async pendingDrivers() {
    return this.drivers.listByStatus('pending');
  }

  async listAudit(page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const { items, total } = await this.audit.list((safePage - 1) * safeLimit, safeLimit);
    return {
      page: safePage,
      limit: safeLimit,
      total,
      items: items.map((row) => ({
        id: row._id.toString(),
        actorId: row.actorId.toString(),
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt,
      })),
    };
  }
}
