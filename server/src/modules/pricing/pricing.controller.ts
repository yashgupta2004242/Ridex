import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import type { AuthService } from '../auth/auth.service';
import { reversePlace, searchPlaces } from './geocode';
import { estimateDto } from './pricing.dto';
import type { PricingService } from './pricing.service';

export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  estimate = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    const result = await this.pricing.estimate(
      req.body as { pickup: { lat: number; lng: number }; drop: { lat: number; lng: number } },
    );
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const query = String(req.query.q ?? '').trim();
    if (query.length < 2) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Type at least two letters of a place');
    }
    try {
      const places = await searchPlaces(query);
      res.status(HTTP.OK).json(success({ places }, req.requestId));
    } catch {
      throw new AppError(
        HTTP.SERVICE_UNAVAILABLE,
        ERROR_CODES.ROUTING_FAILED,
        'Could not search the map. Try again in a moment.',
      );
    }
  });

  reverse = asyncHandler(async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'lat and lng are required');
    }
    try {
      const place = await reversePlace(lat, lng);
      res.status(HTTP.OK).json(success({ place }, req.requestId));
    } catch {
      res.status(HTTP.OK).json(success({ place: { label: 'Current location', lat, lng } }, req.requestId));
    }
  });
}

export function createPricingRouter(controller: PricingController, authService: AuthService): Router {
  const router = Router();
  const auth = requireAuth(authService);
  router.post('/rides/estimate', auth, validateBody(estimateDto), controller.estimate);
  router.get('/geo/search', auth, controller.search);
  router.get('/geo/reverse', auth, controller.reverse);
  return router;
}
