import { z } from 'zod';
import { phoneSchema } from '../auth/auth.dto';

export const updateProfileDto = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phoneSchema.optional(),
});

export const avatarDto = z.object({
  dataUri: z.string().min(32).max(2_000_000),
});
