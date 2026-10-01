import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';
import { logger } from '../../config/logger';
import type { PaymentService } from '../payment/payment.service';
import { RideRepository } from '../ride/ride.repository';
import { rideLngLat } from '../ride/ride.coords';
import type { RideService } from '../ride/ride.service';
import { SavedPlaceRepository } from '../user/savedPlace.repository';
import type { LlmMessage, LlmPort } from './llm';
import { SupportTicketModel } from './supportTicket.model';

const TOOLS = [
  { name: 'getRideDetails', description: "Get the caller's ride by id" },
  { name: 'getFareBreakdown', description: "Get fare lines for the caller's ride" },
  { name: 'cancelRide', description: "Cancel the caller's ride. Requires confirm=true" },
  { name: 'raiseSupportTicket', description: 'Open a support ticket' },
  { name: 'requestRefund', description: 'Refund a captured payment. Requires confirm=true' },
];

export class AiService {
  constructor(
    private readonly llm: LlmPort,
    private readonly rides: RideService,
    private readonly payments: PaymentService,
    private readonly places: SavedPlaceRepository,
    private readonly rideRepo: RideRepository,
  ) {}

  async chat(
    userId: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<{ reply: string; pending?: { tool: string; args: Record<string, unknown> } }> {
    const clipped = messages.slice(-10);
    const packed: LlmMessage[] = [
      {
        role: 'system',
        content: 'You are RideX support. Propose tools; the backend will authorize them. Never invent ride ids.',
      },
      ...clipped,
    ];
    let result: Awaited<ReturnType<LlmPort['complete']>>;
    try {
      result = await withTimeout(this.llm.complete(packed, TOOLS), 8_000);
    } catch (error) {
      logger.warn('LLM fallback', { error: error instanceof Error ? error.message : error });
      result = { text: 'The assistant is offline. Open your trip page to cancel or rate.', toolCalls: [] };
    }
    const call = result.toolCalls[0];
    if (!call) return { reply: result.text };
    if ((call.name === 'cancelRide' || call.name === 'requestRefund') && call.arguments.confirm !== true) {
      return {
        reply: `I can run ${call.name}, but it moves money or the trip. Confirm in the app first.`,
        pending: { tool: call.name, args: call.arguments },
      };
    }
    const output = await this.runTool(userId, call.name, call.arguments);
    return { reply: output };
  }

  async runTool(userId: string, name: string, args: Record<string, unknown>): Promise<string> {
    const rideId = typeof args.rideId === 'string' ? args.rideId : '';
    if (name === 'getRideDetails' || name === 'getFareBreakdown') {
      const ride = await this.rides.get(userId, rideId);
      return JSON.stringify(name === 'getFareBreakdown' ? ride.fare : ride);
    }
    if (name === 'cancelRide') {
      const ride = await this.rides.cancel(userId, rideId, 'Cancelled via support assistant');
      return `Cancelled ${ride.rideCode}`;
    }
    if (name === 'raiseSupportTicket') {
      const message = typeof args.message === 'string' ? args.message : 'Help';
      await SupportTicketModel.create({
        userId,
        rideId: rideId || null,
        kind: args.kind === 'sos' ? 'sos' : 'support',
        message,
      });
      return 'Ticket opened';
    }
    if (name === 'requestRefund') {
      await this.payments.refund(userId, rideId, 'Requested via support assistant', false);
      return 'Refund recorded';
    }
    throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.VALIDATION, 'Unknown tool');
  }

  async searchPlace(
    userId: string,
    query: string,
  ): Promise<{ label: string; lat: number; lng: number; confidence: number; source: string }> {
    const saved = await this.places.list(userId);
    const drops = await this.rideRepo.listDrops(userId, 20);
    const candidates = [
      ...saved.map((row) => ({
        label: row.label,
        address: row.address,
        lat: row.location?.coordinates[1] ?? 0,
        lng: row.location?.coordinates[0] ?? 0,
      })),
      ...drops.map((row) => {
        const drop = rideLngLat(row.drop);
        return { label: drop.address || 'Recent drop', address: drop.address, lat: drop.lat, lng: drop.lng };
      }),
    ];
    const needle = query.toLowerCase();
    const local = candidates.find(
      (row) => row.label.toLowerCase().includes(needle) || row.address.toLowerCase().includes(needle),
    );
    try {
      const result = await withTimeout(
        this.llm.complete(
          [
            {
              role: 'system',
              content: `Pick the best candidate as JSON {"label","lat","lng","confidence"}. Candidates: ${JSON.stringify(candidates.slice(0, 20))}`,
            },
            { role: 'user', content: query },
          ],
          [],
        ),
        8_000,
      );
      const parsed = JSON.parse(result.text) as {
        label?: string;
        lat?: number;
        lng?: number;
        confidence?: number;
      };
      if ((parsed.confidence ?? 0) >= 0.6 && parsed.lat !== undefined && parsed.lng !== undefined) {
        return {
          label: parsed.label ?? query,
          lat: parsed.lat,
          lng: parsed.lng,
          confidence: parsed.confidence ?? 0,
          source: 'llm',
        };
      }
    } catch {
      logger.warn('Place search fell back to substring match');
    }
    if (local) {
      return { ...local, confidence: 0.55, source: 'fallback' };
    }
    throw new AppError(
      HTTP.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      'No saved place or recent drop matched that description',
    );
  }

  async sos(userId: string, rideId: string, message: string): Promise<{ opened: boolean }> {
    await SupportTicketModel.create({ userId, rideId, kind: 'sos', message });
    return { opened: true };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('llm-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
