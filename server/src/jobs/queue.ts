import type { Job } from 'bullmq';

export type MatchJob = { rideId: string };

export type JobQueue = {
  enqueueMatch(rideId: string): Promise<void>;
  enqueueReceipt(rideId: string): Promise<void>;
};

export class InlineJobQueue implements JobQueue {
  constructor(
    private readonly match: (rideId: string) => Promise<void>,
    private readonly receipt?: (rideId: string) => Promise<void>,
  ) {}

  async enqueueMatch(rideId: string): Promise<void> {
    void this.match(rideId);
  }

  async enqueueReceipt(rideId: string): Promise<void> {
    if (this.receipt) void this.receipt(rideId);
  }
}

export class NoopJobQueue implements JobQueue {
  async enqueueMatch(): Promise<void> {
    return;
  }

  async enqueueReceipt(): Promise<void> {
    return;
  }
}

export type MatchHandler = (job: Job<MatchJob>) => Promise<void>;
