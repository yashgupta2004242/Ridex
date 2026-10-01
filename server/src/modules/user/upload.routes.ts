import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { asyncHandler } from '../../common/asyncHandler';
import { HTTP } from '../../common/constants';
import type { StoragePort } from '../../config/storage';
import { requireAuth } from '../../middleware/auth';
import type { AuthService } from '../auth/auth.service';

export function createUploadRouter(storage: StoragePort, authService: AuthService): Router {
  const router = Router();
  router.post(
    '/uploads/sign',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as { folder?: string };
      const folder = body.folder && body.folder.startsWith('ridex/') ? body.folder : 'ridex/uploads';
      const signed = storage.signUpload(folder);
      res.status(HTTP.OK).json(success({ signed }, req.requestId));
    }),
  );
  return router;
}
