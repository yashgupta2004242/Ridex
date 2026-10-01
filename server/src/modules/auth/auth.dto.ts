import { z } from 'zod';
import { normalizeIndianPhone, PHONE_HINT } from '../../common/phone';

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizeIndianPhone)
  .refine((value) => /^\+[1-9]\d{9,14}$/.test(value), { message: PHONE_HINT });

export const registerDto = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  phone: phoneSchema,
  password: z.string().min(8).max(72),
  role: z.enum(['rider', 'driver']),
});

export const loginDto = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export const verifyEmailDto = z.object({
  token: z.string().min(16),
});

export const requestOtpDto = z.object({
  phone: phoneSchema,
});

export const verifyOtpDto = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/),
});

export const forgotPasswordDto = z.object({
  email: z.string().trim().email().toLowerCase(),
});

export const resetPasswordDto = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(72),
});

export type RegisterInput = z.infer<typeof registerDto>;
export type LoginInput = z.infer<typeof loginDto>;
