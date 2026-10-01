import winston from 'winston';
import { getRequestContext } from '../common/requestContext';

const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'otp',
  'otptoken',
  'secret',
  'mongodb_uri',
  'redis_url',
]);

function jsonReplacer(key: string, value: unknown): unknown {
  if (REDACT_KEYS.has(key.toLowerCase())) {
    return '[REDACTED]';
  }
  return value;
}

export function createLogger(level: string): winston.Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf((info) => {
        const context = getRequestContext();
        const payload: Record<string, unknown> = { ...info };
        if (context?.requestId && payload.requestId === undefined) {
          payload.requestId = context.requestId;
        }
        payload.service = 'ridex-server';
        return JSON.stringify(payload, jsonReplacer);
      }),
    ),
    transports: [new winston.transports.Console()],
  });
}

export const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
