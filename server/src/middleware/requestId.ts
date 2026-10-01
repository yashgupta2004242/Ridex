import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../common/requestContext';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  runWithRequestContext({ requestId: id }, () => next());
}
