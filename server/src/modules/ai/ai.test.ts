import { AiService } from './ai.service';
import type { LlmPort } from './llm';
import type { RideService } from '../ride/ride.service';
import type { PaymentService } from '../payment/payment.service';
import { SavedPlaceRepository } from '../user/savedPlace.repository';
import { RideRepository } from '../ride/ride.repository';

describe('AiService', () => {
  it('does not run cancel without confirm, then runs an authorized tool', async () => {
    const llm: LlmPort = {
      async complete() {
        return {
          text: '',
          toolCalls: [{ id: '1', name: 'cancelRide', arguments: { rideId: 'ride-1' } }],
        };
      },
    };
    const cancelled: string[] = [];
    const rides = {
      async cancel(_userId: string, rideId: string) {
        cancelled.push(rideId);
        return { rideCode: 'RX1' };
      },
      async get() {
        return { id: 'ride-1', fare: { total: 10 } };
      },
    } as unknown as RideService;
    const ai = new AiService(
      llm,
      rides,
      {} as PaymentService,
      new SavedPlaceRepository(),
      new RideRepository(),
    );
    const pending = await ai.chat('user-1', [{ role: 'user', content: 'cancel my ride' }]);
    expect(pending.pending?.tool).toBe('cancelRide');
    expect(cancelled).toEqual([]);
    await ai.runTool('user-1', 'cancelRide', { rideId: 'ride-1', confirm: true });
    expect(cancelled).toEqual(['ride-1']);
  });
});
