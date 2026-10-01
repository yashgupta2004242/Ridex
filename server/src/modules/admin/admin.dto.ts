import { z } from 'zod';

export const verifyDriverDto = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional().default(''),
});

export const suspendUserDto = z.object({
  reason: z.string().trim().min(3).max(500),
});
