import request from 'supertest';
import { createApp } from '../../app';
import { MemoryCache } from '../../config/cache';
import { getEnv } from '../../config/env';
import { resetTestMongo, startTestMongo, stopTestMongo } from '../../test/mongo';
import { encodeGeohash } from './geohash';
import { StaticRouter } from './routing';

const env = getEnv();

describe('POST /rides/estimate', () => {
  let cache: MemoryCache;
  const routing = new StaticRouter({ distanceMeters: 5000, durationSeconds: 720, coordinates: [] });
  let routeCalls = 0;
  const countingRouter = {
    route: async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
      routeCalls += 1;
      return routing.route(from, to);
    },
  };

  function app() {
    return createApp({
      env,
      cache,
      routing: countingRouter,
      readiness: { checkMongo: async () => true, checkRedis: async () => true },
    });
  }

  async function token(ip: string): Promise<string> {
    const registered = await request(app())
      .post('/auth/register')
      .set('X-Forwarded-For', ip)
      .send({
        name: 'Rider',
        email: `rider-${ip.replace(/\./g, '')}@example.com`,
        phone: `+919${ip.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`,
        password: 'password1',
        role: 'rider',
      });
    return registered.body.data.accessToken as string;
  }

  beforeAll(async () => {
    await startTestMongo();
  }, 60_000);

  afterAll(async () => {
    await stopTestMongo();
  }, 30_000);

  beforeEach(async () => {
    cache = new MemoryCache();
    routeCalls = 0;
    await resetTestMongo();
  });

  const body = {
    pickup: { lat: 28.6328, lng: 77.2197, address: 'Connaught Place' },
    drop: { lat: 28.5562, lng: 77.1, address: 'Airport' },
  };

  it('returns a quote per vehicle type with a 1x surge when supply matches demand', async () => {
    const hash = encodeGeohash(body.pickup.lat, body.pickup.lng, 6);
    await cache.set(`surge:supply:${hash}`, '20', 300);
    const access = await token('10.8.0.1');
    const response = await request(app())
      .post('/rides/estimate')
      .set('X-Forwarded-For', '10.8.0.2')
      .set('Authorization', `Bearer ${access}`)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.data.distanceMeters).toBe(5000);
    expect(response.body.data.quotes).toHaveLength(4);
    const sedan = response.body.data.quotes.find((q: { vehicleType: string }) => q.vehicleType === 'sedan');
    expect(sedan.surgeMultiplier).toBe(1);
    expect(sedan.base).toBe(60);
    expect(sedan.distance).toBe(75);
  });

  it('caches the OSRM leg for 60 seconds', async () => {
    const access = await token('10.8.1.1');
    const auth = { Authorization: `Bearer ${access}` };
    await request(app()).post('/rides/estimate').set('X-Forwarded-For', '10.8.1.2').set(auth).send(body);
    await request(app()).post('/rides/estimate').set('X-Forwarded-For', '10.8.1.3').set(auth).send(body);
    expect(routeCalls).toBe(1);
  });

  it('raises surge toward 2.5x when demand dwarfs supply', async () => {
    const hash = encodeGeohash(body.pickup.lat, body.pickup.lng, 6);
    await cache.set(`surge:supply:${hash}`, '1', 300);
    const access = await token('10.8.2.1');
    let last = 1;
    for (let i = 0; i < 8; i += 1) {
      const response = await request(app())
        .post('/rides/estimate')
        .set('X-Forwarded-For', `10.8.2.${10 + i}`)
        .set('Authorization', `Bearer ${access}`)
        .send(body);
      last = response.body.data.quotes[0].surgeMultiplier as number;
    }
    expect(last).toBe(2.5);
  });
});
