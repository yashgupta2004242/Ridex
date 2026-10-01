import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { failure } from '../common/ApiResponse';
import { AppError } from '../common/AppError';
import { ERROR_CODES, HTTP } from '../common/constants';
import { logger } from '../config/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn(err.message, { requestId, code: err.code, statusCode: err.statusCode });
    res.status(err.statusCode).json(failure(err.code, err.message, requestId));
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((issue) => issue.message).join('; ');
    res.status(400).json(failure(ERROR_CODES.VALIDATION, message, requestId));
    return;
  }

  logger.error('Unhandled error', {
    requestId,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });

  res
    .status(HTTP.INTERNAL_ERROR)
    .json(failure(ERROR_CODES.INTERNAL, 'An unexpected error occurred', requestId));
}
