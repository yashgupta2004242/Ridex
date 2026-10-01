import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body) as Request['body'];
    next();
  };
}
