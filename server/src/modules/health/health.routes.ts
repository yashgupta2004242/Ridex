import { Router } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import type { HealthController } from './health.controller';

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/health', controller.getHealth);
  router.get('/ready', asyncHandler(controller.getReady));
  return router;
}
