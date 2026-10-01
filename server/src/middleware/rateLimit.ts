import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/AppError';
import { ERROR_CODES, HTTP } from '../common/constants';
import type { CacheStore } from '../config/cache';

export type RateLimitPolicy = {
  prefix: string;
  limit: number;
  windowMs: number;
  key: (req: Request) => string;
};

export const AUTH_IP_LIMIT: RateLimitPolicy = {
  prefix: 'rl:auth',
  limit: 5,
  windowMs: 60_000,
  key: (req) => req.ip || req.socket.remoteAddress || 'unknown',
};

export const OTP_PHONE_LIMIT: RateLimitPolicy = {
  prefix: 'rl:otp',
  limit: 3,
  windowMs: 10 * 60_000,
  key: (req) => {
    const body = req.body as { phone?: unknown };
    return typeof body.phone === 'string' ? body.phone : 'missing-phone';
  },
};

export const RIDE_CREATE_LIMIT: RateLimitPolicy = {
  prefix: 'rl:ride',
  limit: 10,
  windowMs: 60_000,
  key: (req) => req.auth?.userId ?? 'anonymous',
};

export function rateLimit(cache: CacheStore, policy: RateLimitPolicy) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const bucket = `${policy.prefix}:${policy.key(req)}`;
      const result = await cache.hitSlidingWindow(bucket, policy.limit, policy.windowMs);
      res.setHeader('x-ratelimit-limit', String(policy.limit));
      res.setHeader('x-ratelimit-remaining', String(Math.max(0, policy.limit - result.count)));
      if (!result.allowed) {
        next(
          new AppError(
            HTTP.TOO_MANY_REQUESTS,
            ERROR_CODES.RATE_LIMITED,
            'Too many requests. Wait a minute and try again.',
          ),
        );
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
