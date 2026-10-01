import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { AUTH_IP_LIMIT, OTP_PHONE_LIMIT, rateLimit } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';
import type { CacheStore } from '../../config/cache';
import type { AuthService } from './auth.service';
import type { AuthController } from './auth.controller';
import {
  forgotPasswordDto,
  loginDto,
  registerDto,
  requestOtpDto,
  resetPasswordDto,
  verifyEmailDto,
  verifyOtpDto,
} from './auth.dto';

export function createAuthRouter(
  controller: AuthController,
  authService: AuthService,
  cache: CacheStore,
): Router {
  const router = Router();
  const ipLimit = rateLimit(cache, AUTH_IP_LIMIT);
  const otpLimit = rateLimit(cache, OTP_PHONE_LIMIT);
  const auth = requireAuth(authService);

  router.post('/auth/register', ipLimit, validateBody(registerDto), controller.register);
  router.post('/auth/login', ipLimit, validateBody(loginDto), controller.login);
  router.post('/auth/refresh', ipLimit, controller.refresh);
  router.post('/auth/logout', ipLimit, controller.logout);
  router.post('/auth/logout-all', ipLimit, auth, controller.logoutAll);
  router.get('/auth/sessions', ipLimit, auth, controller.sessions);
  router.get('/auth/me', ipLimit, auth, controller.me);
  router.post('/auth/verify-email', ipLimit, validateBody(verifyEmailDto), controller.verifyEmail);
  router.post('/auth/otp/request', ipLimit, validateBody(requestOtpDto), otpLimit, controller.requestOtp);
  router.post('/auth/otp/verify', ipLimit, validateBody(verifyOtpDto), controller.verifyOtp);
  router.post('/auth/forgot-password', ipLimit, validateBody(forgotPasswordDto), controller.forgotPassword);
  router.post('/auth/reset-password', ipLimit, validateBody(resetPasswordDto), controller.resetPassword);
  router.get('/auth/google', ipLimit, controller.googleStart);
  router.get('/auth/google/callback', ipLimit, controller.googleCallback);

  return router;
}
