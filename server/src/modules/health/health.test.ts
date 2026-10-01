import request from 'supertest';
import { createApp } from '../../app';
import { AppError } from '../../common/AppError';
import { loadEnv } from '../../config/env';

const env = loadEnv();

describe('health endpoints', () => {
  it('returns process liveness on GET /health without dependencies', async () => {
    const app = createApp({
      env,
      readiness: {
        checkMongo: async () => false,
        checkRedis: async () => false,
      },
    });

    const response = await request(app).get('/health').set('x-request-id', 'test-health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-health');
    expect(response.body).toMatchObject({
      success: true,
      error: null,
      requestId: 'test-health',
      data: { status: 'ok' },
    });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
  });

  it('returns 503 on GET /ready when mongo or redis is down', async () => {
    const app = createApp({
      env,
      readiness: {
        checkMongo: async () => true,
        checkRedis: async () => false,
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.data).toBeNull();
    expect(response.body.error.code).toBe('NOT_READY');
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it('returns 200 on GET /ready when both probes pass', async () => {
    const app = createApp({
      env,
      readiness: {
        checkMongo: async () => true,
        checkRedis: async () => true,
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ready', mongo: true, redis: true },
    });
  });

  it('uses the global error handler for unexpected failures', async () => {
    const app = createApp({
      env,
      readiness: {
        checkMongo: async () => {
          throw new Error('boom');
        },
        checkRedis: async () => true,
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('An unexpected error occurred');
  });

  it('maps AppError onto the envelope', async () => {
    const app = createApp({
      env,
      readiness: {
        checkMongo: async () => {
          throw new AppError(409, 'CONFLICT', 'already exists');
        },
        checkRedis: async () => true,
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({ code: 'CONFLICT', message: 'already exists' });
  });
});
