import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { requireAuth, requireSelfOrAdmin } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import type { AuthService } from '../auth/auth.service';
import { avatarDto, updateProfileDto } from './user.dto';
import type { UserService } from './user.service';

export class UserController {
  constructor(private readonly userService: UserService) {}

  getById = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId;
    if (!userId) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'User id is required');
    }
    const user = await this.userService.getPublicById(userId);
    res.status(HTTP.OK).json(success({ user }, req.requestId));
  });

  updateMe = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    const user = await this.userService.updateProfile(req.auth.userId, req.body as { name?: string; phone?: string });
    res.status(HTTP.OK).json(success({ user }, req.requestId));
  });

  avatar = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    }
    const body = req.body as { dataUri: string };
    const user = await this.userService.updateAvatar(req.auth.userId, body.dataUri);
    res.status(HTTP.OK).json(success({ user }, req.requestId));
  });
}

export function createUserRouter(controller: UserController, authService: AuthService): Router {
  const router = Router();
  const auth = requireAuth(authService);
  router.patch('/users/me', auth, validateBody(updateProfileDto), controller.updateMe);
  router.post('/users/me/avatar', auth, validateBody(avatarDto), controller.avatar);
  router.get('/users/:userId', auth, requireSelfOrAdmin('userId'), controller.getById);
  return router;
}
