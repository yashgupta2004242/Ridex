import http from 'node:http';
import { createApp, getRidex } from './app';
import { createGracefulShutdown } from './common/gracefulShutdown';
import { connectMongo, disconnectMongo } from './config/db';
import { getEnv, loadEnv } from './config/env';
import { logger } from './config/logger';
import { connectRedis, disconnectRedis } from './config/redis';

async function main(): Promise<void> {
  try {
    loadEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid environment';
    logger.error(message);
    process.exit(1);
  }

  const env = getEnv();

  try {
    await connectMongo(env.MONGODB_URI);
    await connectRedis(env.REDIS_URL);
  } catch (error) {
    logger.error('Failed to connect to dependencies', {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }

  const app = createApp({ env });
  const server = http.createServer(app);
  const realtime = await getRidex(app).attachRealtime(server);

  const shutdown = createGracefulShutdown({
    closeHttp: (callback) => {
      void realtime.close().then(
        () => callback(),
        (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
      );
    },
    disconnectRedis,
    disconnectMongo,
    exit: (code) => process.exit(code),
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  server.listen(env.PORT, () => {
    logger.info('RideX API listening', { port: env.PORT, env: env.NODE_ENV });
  });
}

void main();
