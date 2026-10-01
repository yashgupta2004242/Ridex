import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP } from '../../common/constants';
import type { CacheStore } from '../../config/cache';
import { requireAuth, requireRole } from '../../middleware/auth';
import { requireIdempotencyKey, replayIdempotency } from '../../middleware/idempotency';
import { validateBody } from '../../middleware/validate';
import type { AuthService } from '../auth/auth.service';
import { createPaymentDto, refundDto, verifyPaymentDto } from './payment.dto';
import type { PaymentService } from './payment.service';

export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  create = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { rideId: string; method: 'cash' | 'upi' | 'card' };
    const payment = await this.payments.create(
      this.userId(req),
      body.rideId,
      body.method,
      req.idempotencyKey ?? '',
    );
    res.status(HTTP.CREATED).json(success({ payment }, req.requestId));
  });

  verify = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { razorpayOrderId: string; razorpayPaymentId: string; signature: string };
    const payment = await this.payments.verifyCheckout(this.userId(req), body);
    res.status(HTTP.OK).json(success({ payment }, req.requestId));
  });

  webhook = asyncHandler(async (req: Request, res: Response) => {
    const signature = req.header('x-razorpay-signature') ?? '';
    const raw = req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const payload = typeof req.body === 'string' ? (JSON.parse(req.body) as never) : req.body;
    const result = await this.payments.handleWebhook(raw, signature, payload);
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  refund = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { rideId: string; reason: string };
    const asAdmin = req.auth?.role === 'admin';
    const payment = await this.payments.refund(this.userId(req), body.rideId, body.reason, asAdmin);
    res.status(HTTP.OK).json(success({ payment }, req.requestId));
  });

  earnings = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.payments.earnings(this.userId(req));
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  payouts = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.payments.runWeeklyPayouts();
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  stats = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.payments.adminStats();
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  private userId(req: Request): string {
    if (!req.auth) throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    return req.auth.userId;
  }
}

export function createPaymentRouter(
  controller: PaymentController,
  authService: AuthService,
  cache: CacheStore,
): Router {
  const router = Router();
  const auth = requireAuth(authService);
  router.post(
    '/payments',
    auth,
    requireRole('rider'),
    requireIdempotencyKey,
    replayIdempotency(cache),
    validateBody(createPaymentDto),
    controller.create,
  );
  router.post('/payments/verify', auth, requireRole('rider'), validateBody(verifyPaymentDto), controller.verify);
  router.post('/payments/webhook', controller.webhook);
  router.post('/payments/refund', auth, validateBody(refundDto), controller.refund);
  router.get('/drivers/me/earnings', auth, requireRole('driver'), controller.earnings);
  router.post('/admin/payouts/run', auth, requireRole('admin'), controller.payouts);
  router.get('/admin/stats', auth, requireRole('admin'), controller.stats);
  return router;
}
