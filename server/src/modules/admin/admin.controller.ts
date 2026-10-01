import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import type { AuthService } from '../auth/auth.service';
import { suspendUserDto, verifyDriverDto } from './admin.dto';
import type { AdminService } from './admin.service';

export class AdminController {
  constructor(private readonly admin: AdminService) {}

  pendingDrivers = asyncHandler(async (req: Request, res: Response) => {
    const drivers = await this.admin.pendingDrivers();
    res.status(HTTP.OK).json(success({ drivers }, req.requestId));
  });

  verifyDriver = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId;
    if (!userId) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'User id is required');
    }
    const body = req.body as { decision: 'approved' | 'rejected'; reason?: string };
    const driver = await this.admin.verifyDriver(this.actor(req), userId, body.decision, body.reason ?? '');
    res.status(HTTP.OK).json(success({ driver }, req.requestId));
  });

  suspend = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId;
    if (!userId) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'User id is required');
    }
    const body = req.body as { reason: string };
    const user = await this.admin.suspendUser(this.actor(req), userId, body.reason);
    res.status(HTTP.OK).json(success({ user }, req.requestId));
  });

  reinstate = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId;
    if (!userId) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'User id is required');
    }
    const user = await this.admin.reinstateUser(this.actor(req), userId);
    res.status(HTTP.OK).json(success({ user }, req.requestId));
  });

  audit = asyncHandler(async (req: Request, res: Response) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const logs = await this.admin.listAudit(page, limit);
    res.status(HTTP.OK).json(success(logs, req.requestId));
  });

  private actor(req: Request): string {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    return req.auth.userId;
  }
}

export function createAdminRouter(controller: AdminController, authService: AuthService): Router {
  const router = Router();
  const gate = [requireAuth(authService), requireRole('admin')];
  router.get('/admin/drivers/pending', ...gate, controller.pendingDrivers);
  router.post(
    '/admin/drivers/:userId/verify',
    ...gate,
    validateBody(verifyDriverDto),
    controller.verifyDriver,
  );
  router.post('/admin/users/:userId/suspend', ...gate, validateBody(suspendUserDto), controller.suspend);
  router.post('/admin/users/:userId/reinstate', ...gate, controller.reinstate);
  router.get('/admin/audit-logs', ...gate, controller.audit);
  return router;
}
