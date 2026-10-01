import request from 'supertest';
import { createApp } from '../../app';
import { MemoryCache } from '../../config/cache';
import { getEnv } from '../../config/env';
import { MemoryRazorpay } from '../../config/razorpay';
import { NoopJobQueue } from '../../jobs/queue';
import { resetTestMongo, startTestMongo, stopTestMongo } from '../../test/mongo';
import { RideModel } from '../ride/ride.model';
import { StaticRouter } from '../pricing/routing';

const env = getEnv();

describe('payments', () => {
  let cache: MemoryCache;
  const razorpay = new MemoryRazorpay();

  function app() {
    return createApp({
      env,
      cache,
      razorpay,
      routing: new StaticRouter({ distanceMeters: 1000, durationSeconds: 120 }),
      jobs: new NoopJobQueue(),
      readiness: { checkMongo: async () => true, checkRedis: async () => true },
    });
  }

  beforeAll(async () => {
    await startTestMongo();
  }, 60_000);

  afterAll(async () => {
    await stopTestMongo();
  }, 30_000);

  beforeEach(async () => {
    cache = new MemoryCache();
    razorpay.orders.length = 0;
    await resetTestMongo();
  });

  async function rider() {
    const response = await request(app()).post('/auth/register').send({
      name: 'Pay Rider',
      email: 'pay@example.com',
      phone: '+919111110001',
      password: 'password1',
      role: 'rider',
    });
    return { token: response.body.data.accessToken as string, id: response.body.data.user.id as string };
  }

  it('captures cash, sums the ledger, and ignores a duplicate webhook', async () => {
    const user = await rider();
    const ride = await RideModel.create({
      rideCode: 'RXPAY01',
      riderId: user.id,
      driverId: user.id,
      pickup: { address: 'A', location: { type: 'Point', coordinates: [77.2, 28.6] } },
      drop: { address: 'B', location: { type: 'Point', coordinates: [77.3, 28.7] } },
      vehicleType: 'sedan',
      status: 'COMPLETED',
      fare: { base: 60, distance: 10, time: 5, surge: 0, platformFee: 10, tax: 4, total: 89, surgeMultiplier: 1 },
      distanceMeters: 1000,
      durationSeconds: 120,
      otpHash: '',
      route: [],
      timeline: [{ status: 'COMPLETED', at: new Date(), by: user.id }],
      cancellation: { by: '', reason: '', fee: 0 },
      paymentId: null,
      idempotencyKey: 'pay-1',
    });

    const cash = await request(app())
      .post('/payments')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'pay-header-1')
      .send({ rideId: ride.id, method: 'cash' });
    expect(cash.status).toBe(201);
    expect(cash.body.data.payment.status).toBe('captured');

    const replay = await request(app())
      .post('/payments')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', 'pay-header-1')
      .send({ rideId: ride.id, method: 'cash' });
    expect(replay.body.data.payment.id).toBe(cash.body.data.payment.id);

    const webhookBody = {
      id: 'evt_1',
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'missing' } } },
    };
    const first = await request(app())
      .post('/payments/webhook')
      .set('x-razorpay-signature', 'valid-webhook')
      .send(webhookBody);
    const second = await request(app())
      .post('/payments/webhook')
      .set('x-razorpay-signature', 'valid-webhook')
      .send(webhookBody);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
