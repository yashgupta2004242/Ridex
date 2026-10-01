import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import type { AuthService } from '../auth/auth.service';
import { documentDto, onboardingDto, onlineDto } from './driver.dto';
import type { DriverService } from './driver.service';

export class DriverController {
  constructor(private readonly drivers: DriverService) {}

  me = asyncHandler(async (req: Request, res: Response) => {
    const driver = await this.drivers.getMine(this.userId(req));
    res.status(HTTP.OK).json(success({ driver }, req.requestId));
  });

  onboard = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      licenseNumber: string;
      vehicle: { type: 'bike' | 'auto' | 'sedan' | 'suv'; model: string; plateNumber: string };
    };
    const driver = await this.drivers.onboard(this.userId(req), body);
    res.status(HTTP.OK).json(success({ driver }, req.requestId));
  });

  document = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { type: 'license' | 'registration' | 'insurance' | 'selfie'; dataUri: string };
    const driver = await this.drivers.addDocument(this.userId(req), body.type, body.dataUri);
    res.status(HTTP.OK).json(success({ driver }, req.requestId));
  });

  online = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { isOnline: boolean; lat?: number; lng?: number };
    const point =
      typeof body.lat === 'number' && typeof body.lng === 'number'
        ? { lat: body.lat, lng: body.lng }
        : undefined;
    const driver = await this.drivers.setOnline(this.userId(req), body.isOnline, point);
    res.status(HTTP.OK).json(success({ driver }, req.requestId));
  });

  private userId(req: Request): string {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    return req.auth.userId;
  }
}

export function createDriverRouter(controller: DriverController, authService: AuthService): Router {
  const router = Router();
  const auth = requireAuth(authService);
  const driverOnly = requireRole('driver');
  router.get('/drivers/me', auth, driverOnly, controller.me);
  router.put('/drivers/me/onboarding', auth, driverOnly, validateBody(onboardingDto), controller.onboard);
  router.post('/drivers/me/documents', auth, driverOnly, validateBody(documentDto), controller.document);
  router.post('/drivers/me/online', auth, driverOnly, validateBody(onlineDto), controller.online);
  return router;
}
