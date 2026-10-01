import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { JobQueue } from './queue';

export const MATCHING_QUEUE = 'ridex-matching';
export const RECEIPT_QUEUE = 'ridex-receipts';
export const MATCHING_DLQ = 'ridex-matching-dlq';

export function createBullRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export class BullJobQueue implements JobQueue {
  constructor(
    private readonly matching: Queue,
    private readonly receipts: Queue,
  ) {}

  async enqueueMatch(rideId: string): Promise<void> {
    await this.matching.add(
      'match',
      { rideId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
  }

  async enqueueReceipt(rideId: string): Promise<void> {
    await this.receipts.add(
      'receipt',
      { rideId },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );
  }
}

export function createBullQueues(connection: Redis): { matching: Queue; receipts: Queue; dlq: Queue } {
  return {
    matching: new Queue(MATCHING_QUEUE, { connection }),
    receipts: new Queue(RECEIPT_QUEUE, { connection }),
    dlq: new Queue(MATCHING_DLQ, { connection }),
  };
}
