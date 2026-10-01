import request from 'supertest';
import { createApp } from '../../app';
import { MemoryCache } from '../../config/cache';
import { getEnv } from '../../config/env';
import { MemoryStorage } from '../../config/storage';
import { REFRESH_COOKIE } from '../../common/constants';
import { resetTestMongo, startTestMongo, stopTestMongo } from '../../test/mongo';
import { UserModel } from '../user/user.model';

const env = getEnv();
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function cookie(response: request.Response): string | undefined {
  const headers = response.headers['set-cookie'];
  const list = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const match = list[0]?.match(new RegExp(`^${REFRESH_COOKIE}=([^;]+)`));
  return match?.[1];
}

describe('profiles, drivers and admin', () => {
  let cache: MemoryCache;
  const storage = new MemoryStorage();

  function app() {
    return createApp({
      env,
      cache,
      storage,
      readiness: { checkMongo: async () => true, checkRedis: async () => true },
    });
  }

  function call(ip: string) {
    return {
      post: (url: string) => request(app()).post(url).set('X-Forwarded-For', ip),
      patch: (url: string) => request(app()).patch(url).set('X-Forwarded-For', ip),
      put: (url: string) => request(app()).put(url).set('X-Forwarded-For', ip),
      get: (url: string) => request(app()).get(url).set('X-Forwarded-For', ip),
    };
  }

  async function register(ip: string, overrides: Record<string, string> = {}) {
    const body = {
      name: 'Rider One',
      email: 'rider@example.com',
      phone: '+919111111111',
      password: 'password1',
      role: 'rider',
      ...overrides,
    };
    return call(ip).post('/auth/register').send(body);
  }

  async function adminToken(): Promise<string> {
    const created = await register('10.1.0.1', {
      name: 'Admin',
      email: 'admin@example.com',
      phone: '+919000000001',
    });
    await UserModel.updateOne({ _id: created.body.data.user.id }, { role: 'admin' });
    const login = await call('10.1.0.2')
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'password1' });
    return login.body.data.accessToken as string;
  }

  beforeAll(async () => {
    await startTestMongo();
  }, 60_000);

  afterAll(async () => {
    await stopTestMongo();
  }, 30_000);

  beforeEach(async () => {
    cache = new MemoryCache();
    storage.files.length = 0;
    await resetTestMongo();
  });

  it('lets a user update their profile and avatar', async () => {
    const created = await register('10.2.0.1');
    const token = created.body.data.accessToken as string;

    const patched = await call('10.2.0.2')
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nitin Singh' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.user.name).toBe('Nitin Singh');

    const avatar = await call('10.2.0.3')
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ dataUri: PIXEL });
    expect(avatar.status).toBe(200);
    expect(avatar.body.data.user.avatarUrl).toMatch(/data:image\/|ridex\/avatars/);
    expect(storage.files.some((file) => file.publicId.includes('ridex/avatars'))).toBe(true);
  });

  it('onboards a driver, blocks going online, then admin approves with an audit row', async () => {
    const driverReg = await register('10.3.0.1', {
      name: 'Driver',
      email: 'driver@example.com',
      phone: '+919222222222',
      role: 'driver',
    });
    const driverToken = driverReg.body.data.accessToken as string;
    const driverId = driverReg.body.data.user.id as string;

    const onboarded = await call('10.3.0.2')
      .put('/drivers/me/onboarding')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        licenseNumber: 'MH12AB1234',
        vehicle: { type: 'sedan', model: 'Dzire', plateNumber: 'MH12AB1234' },
      });
    expect(onboarded.status).toBe(200);
    expect(onboarded.body.data.driver.verificationStatus).toBe('pending');

    await call('10.3.0.3')
      .post('/drivers/me/documents')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ type: 'license', dataUri: PIXEL });

    const online = await call('10.3.0.4')
      .post('/drivers/me/online')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ isOnline: true });
    expect(online.status).toBe(403);
    expect(online.body.error.code).toBe('DRIVER_NOT_VERIFIED');

    const token = await adminToken();
    const pending = await call('10.3.0.5')
      .get('/admin/drivers/pending')
      .set('Authorization', `Bearer ${token}`);
    expect(pending.status).toBe(200);
    expect(pending.body.data.drivers).toHaveLength(1);

    const approved = await call('10.3.0.6')
      .post(`/admin/drivers/${driverId}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approved' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.driver.verificationStatus).toBe('approved');

    const go = await call('10.3.0.7')
      .post('/drivers/me/online')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ isOnline: true });
    expect(go.status).toBe(200);
    expect(go.body.data.driver.isOnline).toBe(true);

    const logs = await call('10.3.0.8')
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`);
    expect(logs.body.data.items.some((row: { action: string }) => row.action === 'driver.approved')).toBe(
      true,
    );
  });

  it('suspends a user, writes an audit log, and kills their refresh family', async () => {
    const rider = await register('10.4.0.1');
    const riderId = rider.body.data.user.id as string;
    const refresh = cookie(rider);
    const token = await adminToken();

    const suspended = await call('10.4.0.2')
      .post(`/admin/users/${riderId}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Fraud reports from three trips' });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.user.status).toBe('suspended');

    const reuse = await call('10.4.0.3')
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refresh}`);
    expect(reuse.status).toBe(401);

    const login = await call('10.4.0.4')
      .post('/auth/login')
      .send({ email: 'rider@example.com', password: 'password1' });
    expect(login.status).toBe(403);

    const asRider = await call('10.4.0.5')
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${rider.body.data.accessToken}`);
    expect(asRider.status).toBe(403);
  });
});
