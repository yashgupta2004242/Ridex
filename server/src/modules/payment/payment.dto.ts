import { z } from 'zod';
import { PAYMENT_METHODS } from './payment.model';

export const createPaymentDto = z.object({
  rideId: z.string().min(8),
  method: z.enum(PAYMENT_METHODS),
});

export const verifyPaymentDto = z.object({
  razorpayOrderId: z.string().min(4),
  razorpayPaymentId: z.string().min(4),
  signature: z.string().min(4),
});

export const refundDto = z.object({
  rideId: z.string().min(8),
  reason: z.string().trim().min(3).max(200),
});
