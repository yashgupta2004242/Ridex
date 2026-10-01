import { z } from 'zod';

const point = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  address: z.string().trim().max(200).optional(),
});

export const estimateDto = z.object({
  pickup: point,
  drop: point,
});

export type EstimateInput = z.infer<typeof estimateDto>;
