import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createApp } from '../app';
import { MemoryCache } from '../config/cache';
import { getEnv, loadEnv } from '../config/env';
import { logger } from '../config/logger';

const nodeRequire = createRequire(__filename);
const autocannon = nodeRequire('autocannon') as {
  (
    opts: { url: string; duration: number; connections: number; pipelining: number },
    cb: (error: Error | null, result: { latency: { p50: number; p99: number } }) => void,
  ): object;
  track: (instance: object, opts?: { renderProgressBar?: boolean }) => void;
};

async function fire(url: string, title: string): Promise<{ latency: { p50: number; p99: number } }> {
  logger.info(title, { url });
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url,
        duration: 8,
        connections: 20,
        pipelining: 1,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main(): Promise<void> {
  loadEnv();
  const env = getEnv();
  const app = createApp({
    env,
    cache: new MemoryCache(),
    readiness: { checkMongo: async () => true, checkRedis: async () => true },
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not bind bench server');
  }
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fire(`${base}/health`, 'autocannon GET /health');
  const ready = await fire(`${base}/ready`, 'autocannon GET /ready (stubbed deps)');
  logger.info('p95 latency ms', {
    health: health.latency.p99,
    ready: ready.latency.p99,
    healthP50: health.latency.p50,
    readyP50: ready.latency.p50,
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

void main().catch((error: unknown) => {
  logger.error('Bench failed', { error: error instanceof Error ? error.message : error });
  process.exit(1);
});
