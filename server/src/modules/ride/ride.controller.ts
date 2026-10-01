import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { requireAuth, requireRole } from '../../middleware/auth';
import { requireIdempotencyKey, replayIdempotency } from '../../middleware/idempotency';
import { RIDE_CREATE_LIMIT, rateLimit } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';
import type { CacheStore } from '../../config/cache';
import type { AuthService } from '../auth/auth.service';
import { cancelRideDto, createRideDto, rateRideDto, startRideDto } from './ride.dto';
import type { RideService } from './ride.service';

export class RideController {
  constructor(private readonly rides: RideService) {}

  create = asyncHandler(async (req: Request, res: Response) => {
    const ride = await this.rides.create(this.userId(req), req.body, req.idempotencyKey ?? '');
    res.status(HTTP.CREATED).json(success({ ride }, req.requestId));
  });

  get = asyncHandler(async (req: Request, res: Response) => {
    const ride = await this.rides.get(this.userId(req), this.rideId(req));
    res.status(HTTP.OK).json(success({ ride }, req.requestId));
  });

  active = asyncHandler(async (req: Request, res: Response) => {
    const snapshot = await this.rides.getActiveForUser(this.userId(req));
    res.status(HTTP.OK).json(success({ ride: snapshot }, req.requestId));
  });

  history = asyncHandler(async (req: Request, res: Response) => {
    const rides = await this.rides.history(this.userId(req));
    res.status(HTTP.OK).json(success({ rides }, req.requestId));
  });

  live = asyncHandler(async (req: Request, res: Response) => {
    const rides = await this.rides.liveMap();
    res.status(HTTP.OK).json(success({ rides }, req.requestId));
  });

  accept = asyncHandler(async (req: Request, res: Response) => {
    const ride = await this.rides.accept(this.userId(req), this.rideId(req));
    res.status(HTTP.OK).json(success({ ride }, req.requestId));
  });

  decline = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.rides.decline(this.userId(req), this.rideId(req));
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  arrived = asyncHandler(async (req: Request, res: Response) => {
    const ride = await this.rides.arrived(this.userId(req), this.rideId(req));
    res.status(HTTP.OK).json(success({ ride }, req.requestId));
  });

  start = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { otp: string };
    const ride = await this.rides.start(this.userId(req), this.rideId(req), body.otp);
    res.status(HTTP.OK).json(success({ ride }, req.requestId));
  });

  complete = asyncHandler(async (req: Request, res: Response) => {
    const ride = await this.rides.complete(this.userId(req), this.rideId(req));
    res.status(HTTP.OK).json(success({ ride }, req.requestId));
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { reason: string };
    const ride = await this.rides.cancel(this.userId(req), this.rideId(req), body.reason);
    res.status(HTTP.OK).json(success({ ride }, req.requestId));
  });

  rate = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { score: number; comment: string };
    const result = await this.rides.rate(this.userId(req), this.rideId(req), body.score, body.comment);
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  private userId(req: Request): string {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    return req.auth.userId;
  }

  private rideId(req: Request): string {
    const id = req.params.id;
    if (!id) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Ride id is required');
    }
    return id;
  }
}

export function createRideRouter(
  controller: RideController,
  authService: AuthService,
  cache: CacheStore,
): Router {
  const router = Router();
  const auth = requireAuth(authService);
  const rider = requireRole('rider');
  const driver = requireRole('driver');
  router.post(
    '/rides',
    auth,
    rider,
    rateLimit(cache, RIDE_CREATE_LIMIT),
    requireIdempotencyKey,
    replayIdempotency(cache),
    validateBody(createRideDto),
    controller.create,
  );
  router.get('/rides/active', auth, controller.active);
  router.get('/rides', auth, controller.history);
  router.get('/admin/rides/live', auth, requireRole('admin'), controller.live);
  router.get('/rides/:id', auth, controller.get);
  router.post('/rides/:id/accept', auth, driver, controller.accept);
  router.post('/rides/:id/decline', auth, driver, controller.decline);
  router.post('/rides/:id/arrived', auth, driver, controller.arrived);
  router.post('/rides/:id/start', auth, driver, validateBody(startRideDto), controller.start);
  router.post('/rides/:id/complete', auth, driver, controller.complete);
  router.post('/rides/:id/cancel', auth, validateBody(cancelRideDto), controller.cancel);
  router.post('/rides/:id/rate', auth, rider, validateBody(rateRideDto), controller.rate);
  return router;
}
