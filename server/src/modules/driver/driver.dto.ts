import { z } from 'zod';
import { DOCUMENT_TYPES, VEHICLE_TYPES } from './driver.model';

export const onboardingDto = z.object({
  licenseNumber: z.string().trim().min(5).max(40),
  vehicle: z.object({
    type: z.enum(VEHICLE_TYPES),
    model: z.string().trim().min(1).max(80),
    plateNumber: z.string().trim().min(4).max(20),
  }),
});

export const documentDto = z.object({
  type: z.enum(DOCUMENT_TYPES),
  dataUri: z.string().min(32).max(2_000_000),
});

export const onlineDto = z.object({
  isOnline: z.boolean(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
});
