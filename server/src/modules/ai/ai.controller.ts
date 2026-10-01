import type { Request, Response } from 'express';
import { Router } from 'express';
import { success } from '../../common/ApiResponse';
import { AppError } from '../../common/AppError';
import { asyncHandler } from '../../common/asyncHandler';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { z } from 'zod';
import type { AuthService } from '../auth/auth.service';
import type { AiService } from './ai.service';
import { SavedPlaceRepository } from '../user/savedPlace.repository';

const chatDto = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(10),
});

const searchDto = z.object({ query: z.string().trim().min(2).max(200) });
const sosDto = z.object({ rideId: z.string().min(8), message: z.string().trim().min(3).max(200) });
const placeDto = z.object({
  label: z.string().trim().min(1).max(40),
  address: z.string().trim().max(200).optional().default(''),
  lat: z.number(),
  lng: z.number(),
});
const confirmDto = z.object({
  tool: z.string(),
  args: z
    .object({
      rideId: z.string().optional(),
      message: z.string().optional(),
      kind: z.string().optional(),
      confirm: z.boolean().optional(),
    })
    .passthrough(),
});

export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly places: SavedPlaceRepository,
  ) {}

  chat = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { messages: { role: 'user' | 'assistant'; content: string }[] };
    const result = await this.ai.chat(this.userId(req), body.messages);
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  chatStream = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { messages: { role: 'user' | 'assistant'; content: string }[] };
    const result = await this.ai.chat(this.userId(req), body.messages);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const words = result.reply.split(' ');
    for (const word of words) {
      res.write(`data: ${JSON.stringify({ token: `${word} ` })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true, pending: result.pending })}\n\n`);
    res.end();
  });

  confirm = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { tool: string; args: Record<string, unknown> };
    const reply = await this.ai.runTool(this.userId(req), body.tool, { ...body.args, confirm: true });
    res.status(HTTP.OK).json(success({ reply }, req.requestId));
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { query: string };
    const place = await this.ai.searchPlace(this.userId(req), body.query);
    res.status(HTTP.OK).json(success({ place }, req.requestId));
  });

  sos = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { rideId: string; message: string };
    const result = await this.ai.sos(this.userId(req), body.rideId, body.message);
    res.status(HTTP.OK).json(success(result, req.requestId));
  });

  listPlaces = asyncHandler(async (req: Request, res: Response) => {
    const items = await this.places.list(this.userId(req));
    res.status(HTTP.OK).json(
      success(
        {
          places: items.map((row) => ({
            id: row.id,
            label: row.label,
            address: row.address,
            lat: row.location?.coordinates[1] ?? 0,
            lng: row.location?.coordinates[0] ?? 0,
          })),
        },
        req.requestId,
      ),
    );
  });

  addPlace = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { label: string; address: string; lat: number; lng: number };
    const row = await this.places.create(this.userId(req), body);
    res.status(HTTP.CREATED).json(success({ id: row.id }, req.requestId));
  });

  private userId(req: Request): string {
    if (!req.auth) throw new AppError(HTTP.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Sign in to continue');
    return req.auth.userId;
  }
}

export function createAiRouter(
  controller: AiController,
  authService: AuthService,
): Router {
  const router = Router();
  const auth = requireAuth(authService);
  router.post('/ai/chat', auth, validateBody(chatDto), controller.chat);
  router.post('/ai/chat/stream', auth, validateBody(chatDto), controller.chatStream);
  router.post('/ai/confirm', auth, validateBody(confirmDto), controller.confirm);
  router.post('/ai/search', auth, validateBody(searchDto), controller.search);
  router.post('/ai/sos', auth, validateBody(sosDto), controller.sos);
  router.get('/places', auth, controller.listPlaces);
  router.post('/places', auth, validateBody(placeDto), controller.addPlace);
  return router;
}
