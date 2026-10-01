import mongoose from 'mongoose';
import { logger } from './logger';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

export type MongoStatus = {
  connected: boolean;
};

export const mongoStatus: MongoStatus = { connected: false };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function connectMongo(uri: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      mongoStatus.connected = true;
      logger.info('MongoDB connected', { attempt });
      return;
    } catch (error) {
      lastError = error;
      mongoStatus.connected = false;
      logger.warn('MongoDB connection failed', { attempt, maxAttempts: MAX_ATTEMPTS });
      if (attempt < MAX_ATTEMPTS) {
        await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('MongoDB connection failed');
}

export async function pingMongo(): Promise<boolean> {
  if (!mongoStatus.connected || !mongoose.connection.db) {
    return false;
  }
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  mongoStatus.connected = false;
}
