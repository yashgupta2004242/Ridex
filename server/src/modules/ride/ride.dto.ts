import { z } from 'zod';
import { VEHICLE_TYPES } from '../driver/driver.model';

const point = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  address: z.string().trim().max(200).optional(),
});

export const createRideDto = z.object({
  pickup: point,
  drop: point,
  vehicleType: z.enum(VEHICLE_TYPES),
});

export const cancelRideDto = z.object({
  reason: z.string().trim().min(3).max(200),
});

export const startRideDto = z.object({
  otp: z.string().regex(/^\d{4}$/),
});

export const rateRideDto = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional().default(''),
});

export const routePingDto = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export type CreateRideInput = z.infer<typeof createRideDto>;
