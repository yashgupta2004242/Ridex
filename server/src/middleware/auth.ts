import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/AppError';
import { ERROR_CODES, HTTP } from '../common/constants';
import type { AuthService } from '../modules/auth/auth.service';
import type { UserRole } from '../modules/user/user.model';

export function requireAuth(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      next(new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue'));
      return;
    }
    try {
      const claims = authService.verifyAccessToken(header.slice('Bearer '.length));
      req.auth = claims;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue'));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'You do not have access to this resource'));
      return;
    }
    next();
  };
}

export function requireSelfOrAdmin(param = 'userId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue'));
      return;
    }
    const resourceId = req.params[param];
    if (req.auth.role === 'admin' || req.auth.userId === resourceId) {
      next();
      return;
    }
    next(new AppError(HTTP.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'You can only access your own account'));
  };
}
