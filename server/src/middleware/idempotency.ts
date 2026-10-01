import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/AppError';
import { ERROR_CODES, HTTP, IDEMPOTENCY_TTL_SECONDS } from '../common/constants';
import type { CacheStore } from '../config/cache';

export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.header('idempotency-key');
  if (!key || key.trim().length < 8) {
    next(
      new AppError(
        HTTP.BAD_REQUEST,
        ERROR_CODES.IDEMPOTENCY_REQUIRED,
        'Send an Idempotency-Key header (at least 8 characters)',
      ),
    );
    return;
  }
  req.idempotencyKey = key.trim();
  next();
}

export function replayIdempotency(cache: CacheStore) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth || !req.idempotencyKey) {
      next();
      return;
    }
    const redisKey = `idemp:${req.auth.userId}:${req.idempotencyKey}`;
    try {
      const hit = await cache.get(redisKey);
      if (hit) {
        const stored = JSON.parse(hit) as { status: number; body: unknown };
        res.status(stored.status).json(stored.body);
        return;
      }
      const send = res.json.bind(res);
      res.json = ((body: unknown) => {
        const status = res.statusCode || HTTP.OK;
        void cache.set(redisKey, JSON.stringify({ status, body }), IDEMPOTENCY_TTL_SECONDS);
        return send(body);
      }) as Response['json'];
      next();
    } catch (error) {
      next(error);
    }
  };
}
