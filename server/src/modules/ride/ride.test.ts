import request from 'supertest';
import { createApp, getRidex } from '../../app';
import { MemoryCache } from '../../config/cache';
import { getEnv } from '../../config/env';
import { MemoryGeo } from '../../realtime/geo';
import { NoopJobQueue } from '../../jobs/queue';
import { StaticRouter } from '../pricing/routing';
import { resetTestMongo, startTestMongo, stopTestMongo } from '../../test/mongo';
import { UserModel } from '../user/user.model';
import { RideModel } from './ride.model';
import type { Express } from 'express';

const env = getEnv();
const pickup = { lat: 28.6139, lng: 77.209, address: 'CP' };
const drop = { lat: 28.5562, lng: 77.1, address: 'Airport' };

describe('rides and matching', () => {
  let cache: MemoryCache;
  let geo: MemoryGeo;
  let app: Express;
  const routing = new StaticRouter({ distanceMeters: 8000, durationSeconds: 900 });

  beforeAll(async () => {
    await startTestMongo();
  }, 60_000);

  afterAll(async () => {
    await stopTestMongo();
  }, 30_000);

  beforeEach(async () => {
    cache = new MemoryCache();
    geo = new MemoryGeo();
    await resetTestMongo();
    app = createApp({
      env,
      cache,
      geo,
      routing,
      jobs: new NoopJobQueue(),
      offerTimeoutMs: 30,
      readiness: { checkMongo: async () => true, checkRedis: async () => true },
    });
  });

  async function register(
    role: 'rider' | 'driver',
    email: string,
    phone: string,
    ip: string,
  ): Promise<{ token: string; id: string }> {
    const response = await request(app)
      .post('/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ name: role, email, phone, password: 'password1', role });
    expect(response.status).toBe(201);
    return { token: response.body.data.accessToken as string, id: response.body.data.user.id as string };
  }

  async function approveOnline(driver: { token: string; id: string }, ip: string): Promise<void> {
    await request(app)
      .put('/drivers/me/onboarding')
      .set('Authorization', `Bearer ${driver.token}`)
      .set('X-Forwarded-For', ip)
      .send({
        licenseNumber: 'MH12AB1000',
        vehicle: { type: 'sedan', model: 'Dzire', plateNumber: 'MH12AB1000' },
      });
    const admin = await register('rider', `admin-${ip}@example.com`, `+9198${ip.replace(/\D/g, '').slice(-8).padStart(8, '0')}`, `${ip}.9`);
    await UserModel.updateOne({ _id: admin.id }, { role: 'admin' });
    const login = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', `${ip}.8`)
      .send({ email: `admin-${ip}@example.com`, password: 'password1' });
    await request(app)
      .post(`/admin/drivers/${driver.id}/verify`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ decision: 'approved' });
    const online = await request(app)
      .post('/drivers/me/online')
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ isOnline: true });
    expect(online.status).toBe(200);
  }

  it('replays POST /rides with the same Idempotency-Key', async () => {
    const rider = await register('rider', 'idem@example.com', '+919111111101', '11.0.0.1');
    const body = { pickup, drop, vehicleType: 'sedan' };
    const first = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${rider.token}`)
      .set('Idempotency-Key', 'same-key-123')
      .send(body);
    const second = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${rider.token}`)
      .set('Idempotency-Key', 'same-key-123')
      .send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.ride.id).toBe(first.body.data.ride.id);
    expect(first.body.data.ride.path.length).toBeGreaterThanOrEqual(2);
  });

  it('matches the nearest eligible driver who accepts', async () => {
    const rider = await register('rider', 'match-r@example.com', '+919111111102', '11.0.1.1');
    const near = await register('driver', 'near@example.com', '+919111111103', '11.0.1.2');
    const far = await register('driver', 'far@example.com', '+919111111104', '11.0.1.3');
    await approveOnline(near, '11.0.1.2');
    await approveOnline(far, '11.0.1.3');
    await geo.add(near.id, { lat: pickup.lat, lng: pickup.lng });
    await geo.add(far.id, { lat: pickup.lat + 0.03, lng: pickup.lng + 0.03 });

    app = createApp({
      env,
      cache,
      geo,
      routing,
      jobs: new NoopJobQueue(),
      offerTimeoutMs: 40,
      matchingHooks: {
        onOffered: async (rideId, driverId) => {
          if (driverId === near.id) {
            await getRidex(app).rides.decline(driverId, rideId);
            return;
          }
          await getRidex(app).rides.accept(driverId, rideId);
        },
      },
      readiness: { checkMongo: async () => true, checkRedis: async () => true },
    });

    const created = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${rider.token}`)
      .set('Idempotency-Key', 'match-key-1')
      .send({ pickup, drop, vehicleType: 'sedan' });
    expect(created.status).toBe(201);
    await getRidex(app).matching.run(created.body.data.ride.id);
    const ride = await request(app)
      .get(`/rides/${created.body.data.ride.id}`)
      .set('Authorization', `Bearer ${rider.token}`);
    expect(ride.body.data.ride.driverId).toBe(far.id);
    expect(ride.body.data.ride.status).toBe('DRIVER_ARRIVING');
  });

  it('marks NO_DRIVERS_FOUND after three empty rounds', async () => {
    const rider = await register('rider', 'empty@example.com', '+919111111105', '11.0.2.1');
    const created = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${rider.token}`)
      .set('Idempotency-Key', 'empty-key-1')
      .send({ pickup, drop, vehicleType: 'sedan' });
    await getRidex(app).matching.run(created.body.data.ride.id);
    const ride = await request(app)
      .get(`/rides/${created.body.data.ride.id}`)
      .set('Authorization', `Bearer ${rider.token}`);
    expect(ride.body.data.ride.status).toBe('NO_DRIVERS_FOUND');
  });

  it('lets exactly one driver win a double-accept 100 times', async () => {
    const rider = await register('rider', 'race-r@example.com', '+919111111106', '11.0.3.1');
    const d1 = await register('driver', 'race-a@example.com', '+919111111107', '11.0.3.2');
    const d2 = await register('driver', 'race-b@example.com', '+919111111108', '11.0.3.3');
    await approveOnline(d1, '11.0.3.2');
    await approveOnline(d2, '11.0.3.3');
    const rides = getRidex(app).rides;

    for (let i = 0; i < 100; i += 1) {
      const doc = await RideModel.create({
        rideCode: `RXRACE${i.toString().padStart(4, '0')}`,
        riderId: rider.id,
        driverId: null,
        pickup: { address: 'A', location: { type: 'Point', coordinates: [pickup.lng, pickup.lat] } },
        drop: { address: 'B', location: { type: 'Point', coordinates: [drop.lng, drop.lat] } },
        vehicleType: 'sedan',
        status: 'SEARCHING',
        fare: { base: 60, distance: 10, time: 5, surge: 0, platformFee: 10, tax: 4, total: 89, surgeMultiplier: 1 },
        distanceMeters: 8000,
        durationSeconds: 900,
        otpHash: '',
        route: [],
        timeline: [{ status: 'SEARCHING', at: new Date(), by: 'system' }],
        cancellation: { by: '', reason: '', fee: 0 },
        paymentId: null,
        idempotencyKey: `race-${i}`,
      });
      const outcomes = await Promise.allSettled([rides.accept(d1.id, doc.id), rides.accept(d2.id, doc.id)]);
      const wins = outcomes.filter((row) => row.status === 'fulfilled');
      const losses = outcomes.filter((row) => row.status === 'rejected');
      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(1);
      const winner = (wins[0] as PromiseFulfilledResult<{ driverId: string | null }>).value;
      await rides.cancel(winner.driverId === d1.id ? d1.id : d2.id, doc.id, 'Clear the slot for the next race');
    }
  }, 60_000);

  it('starts only with the rider OTP and completes a fare', async () => {
    const rider = await register('rider', 'otp-r@example.com', '+919111111109', '11.0.4.1');
    const driver = await register('driver', 'otp-d@example.com', '+919111111110', '11.0.4.2');
    await approveOnline(driver, '11.0.4.2');
    await geo.add(driver.id, { lat: pickup.lat, lng: pickup.lng });
    app = createApp({
      env,
      cache,
      geo,
      routing,
      jobs: new NoopJobQueue(),
      offerTimeoutMs: 40,
      matchingHooks: {
        onOffered: async (rideId, driverId) => {
          await getRidex(app).rides.accept(driverId, rideId);
        },
      },
      readiness: { checkMongo: async () => true, checkRedis: async () => true },
    });
    const created = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${rider.token}`)
      .set('Idempotency-Key', 'otp-key-1')
      .send({ pickup, drop, vehicleType: 'sedan' });
    await getRidex(app).matching.run(created.body.data.ride.id);
    const rideId = created.body.data.ride.id as string;
    const arrived = await request(app).post(`/rides/${rideId}/arrived`).set('Authorization', `Bearer ${driver.token}`);
    expect(arrived.status).toBe(200);
    const asRider = await request(app).get(`/rides/${rideId}`).set('Authorization', `Bearer ${rider.token}`);
    const otp = asRider.body.data.ride.otp as string;
    expect(otp).toMatch(/^\d{4}$/);
    const bad = await request(app)
      .post(`/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ otp: '0000' });
    expect(bad.status).toBe(400);
    const started = await request(app)
      .post(`/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ otp });
    expect(started.body.data.ride.status).toBe('IN_PROGRESS');
    const done = await request(app)
      .post(`/rides/${rideId}/complete`)
      .set('Authorization', `Bearer ${driver.token}`);
    expect(done.body.data.ride.status).toBe('COMPLETED');
    const rated = await request(app)
      .post(`/rides/${rideId}/rate`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ score: 5, comment: 'Smooth' });
    expect(rated.body.data.rated).toBe(true);
  });
});
