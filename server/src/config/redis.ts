import { Redis } from 'ioredis';
import { logger } from './logger';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

export type RedisStatus = {
  connected: boolean;
};

export const redisStatus: RedisStatus = { connected: false };

let client: Redis | undefined;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getRedis(): Redis {
  if (!client) {
    throw new Error('Redis has not been connected yet');
  }
  return client;
}

export async function connectRedis(url: string): Promise<Redis> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    try {
      await redis.connect();
      await redis.ping();
      client = redis;
      redisStatus.connected = true;
      logger.info('Redis connected', { attempt });
      redis.on('close', () => {
        redisStatus.connected = false;
      });
      redis.on('ready', () => {
        redisStatus.connected = true;
      });
      return redis;
    } catch (error) {
      lastError = error;
      redisStatus.connected = false;
      redis.disconnect();
      logger.warn('Redis connection failed', { attempt, maxAttempts: MAX_ATTEMPTS });
      if (attempt < MAX_ATTEMPTS) {
        await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Redis connection failed');
}

export async function pingRedis(): Promise<boolean> {
  if (!client || !redisStatus.connected) {
    return false;
  }
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    client.disconnect();
    client = undefined;
  }
  redisStatus.connected = false;
}
