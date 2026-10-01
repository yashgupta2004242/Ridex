import { Queue, Worker } from 'bullmq';
import { createApp, getRidex } from '../app';
import { MATCHING_DLQ, MATCHING_QUEUE, RECEIPT_QUEUE, createBullRedis } from './bull';
import { connectMongo } from '../config/db';
import { getEnv, loadEnv } from '../config/env';
import { logger } from '../config/logger';
import { connectRedis } from '../config/redis';
import { OpenAiLlm, FallbackLlm } from '../modules/ai/llm';
import { summarizePendingRides, summarizeRide } from './summaries';

async function main(): Promise<void> {
  loadEnv();
  const env = getEnv();
  await connectMongo(env.MONGODB_URI);
  await connectRedis(env.REDIS_URL);
  const app = createApp({ env });
  const { matching } = getRidex(app);
  const connection = createBullRedis(env.REDIS_URL);
  const dlq = new Queue(MATCHING_DLQ, { connection });
  const llm = env.OPENAI_API_KEY ? new OpenAiLlm(env.OPENAI_API_KEY, env.OPENAI_MODEL) : new FallbackLlm();

  const matchWorker = new Worker(
    MATCHING_QUEUE,
    async (job) => {
      const rideId = (job.data as { rideId?: string }).rideId;
      if (!rideId) return;
      await matching.run(rideId);
    },
    { connection, concurrency: 5 },
  );

  const receiptWorker = new Worker(
    RECEIPT_QUEUE,
    async (job) => {
      const rideId = (job.data as { rideId?: string }).rideId;
      logger.info('Receipt job', { rideId });
      if (rideId) await summarizeRide(rideId, llm);
    },
    { connection, concurrency: 5 },
  );

  matchWorker.on('failed', (job, error) => {
    logger.error('Matching job failed', { jobId: job?.id, error: error.message });
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void dlq.add('dead', { rideId: job.data, failedReason: error.message });
    }
  });

  receiptWorker.on('failed', (job, error) => {
    logger.error('Receipt job failed', { jobId: job?.id, error: error.message });
  });

  setInterval(() => {
    void summarizePendingRides(llm);
  }, 6 * 60 * 60 * 1000);

  logger.info('RideX workers listening');
}

void main().catch((error: unknown) => {
  logger.error('Worker failed to start', { error: error instanceof Error ? error.message : error });
  process.exit(1);
});
