import type { NextFunction, Request, Response } from 'express';
import mongoSanitize from 'express-mongo-sanitize';

function sanitizeObject(value: unknown): void {
  if (value && typeof value === 'object') {
    mongoSanitize.sanitize(value as Record<string, unknown>);
  }
}

export function sanitizeMongo(req: Request, _res: Response, next: NextFunction): void {
  sanitizeObject(req.body);
  sanitizeObject(req.params);
  sanitizeObject(req.query);
  next();
}
