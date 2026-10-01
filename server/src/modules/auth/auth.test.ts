import request from 'supertest';
import { createApp } from '../../app';
import { REFRESH_COOKIE } from '../../common/constants';
import { MemoryCache } from '../../config/cache';
import { getEnv } from '../../config/env';
import { resetTestMongo, startTestMongo, stopTestMongo } from '../../test/mongo';
import { UserModel } from '../user/user.model';
import type { MailerPort } from './auth.service';
import type { GoogleOAuthPort } from './googleOAuth';

const env = getEnv();

function extractCookie(response: request.Response, name: string): string | undefined {
  const headers = response.headers['set-cookie'];
  const list = Array.isArray(headers) ? headers : headers ? [headers] : [];
  for (const header of list) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  return undefined;
}

describe('auth', () => {
  let cache: MemoryCache;
  const mailbox: { email: string; token: string; kind: string }[] = [];
  const mailer: MailerPort = {
    async sendEmailVerification(email, token) {
      mailbox.push({ email, token, kind: 'verify' });
    },
    async sendPasswordReset(email, token) {
      mailbox.push({ email, token, kind: 'reset' });
    },
  };
  const google: GoogleOAuthPort = {
    buildAuthUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    exchangeCode: async () => ({
      sub: 'google-sub-1',
      email: 'google.rider@example.com',
      name: 'Google Rider',
      emailVerified: true,
    }),
  };

  const rider = {
    name: 'Nitin',
    email: 'nitin@example.com',
    phone: '+919876543210',
    password: 'password1',
    role: 'rider' as const,
  };

  function app() {
    return createApp({
      env,
      cache,
      mailer,
      googleOAuth: google,
      otpGenerator: () => '123456',
      readiness: { checkMongo: async () => true, checkRedis: async () => true },
    });
  }

  function call(ip: string) {
    return {
      post: (url: string) => request(app()).post(url).set('X-Forwarded-For', ip),
      get: (url: string) => request(app()).get(url).set('X-Forwarded-For', ip),
    };
  }

  beforeAll(async () => {
    await startTestMongo();
  }, 60_000);

  afterAll(async () => {
    await stopTestMongo();
  }, 30_000);

  beforeEach(async () => {
    cache = new MemoryCache();
    mailbox.length = 0;
    await resetTestMongo();
  });

  it('registers a rider and returns an access token plus httpOnly refresh cookie', async () => {
    const response = await call('10.0.0.1').post('/auth/register').send(rider);

    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe(rider.email);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(extractCookie(response, REFRESH_COOKIE)).toBeTruthy();
    expect(mailbox.some((item) => item.kind === 'verify')).toBe(true);
  });

  it('accepts a 10-digit Indian mobile and stores E.164', async () => {
    const response = await call('10.0.0.11').post('/auth/register').send({
      ...rider,
      email: 'ten-digit@example.com',
      phone: '7973311270',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.user.phone).toBe('+917973311270');
  });

  it('rotates the refresh token and detects reuse', async () => {
    const http = call('10.0.0.2');
    const registered = await http.post('/auth/register').send(rider);
    const first = extractCookie(registered, REFRESH_COOKIE);
    expect(first).toBeTruthy();

    const rotated = await http.post('/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${first}`);
    expect(rotated.status).toBe(200);
    const second = extractCookie(rotated, REFRESH_COOKIE);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    const reuse = await http.post('/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${first}`);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    const afterTheft = await http.post('/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${second}`);
    expect(afterTheft.status).toBe(401);
  });

  it('locks OTP after three wrong guesses', async () => {
    const http = call('10.0.0.3');
    await http.post('/auth/register').send(rider);
    await http.post('/auth/otp/request').send({ phone: rider.phone });

    await http.post('/auth/otp/verify').send({ phone: rider.phone, code: '000000' });
    await http.post('/auth/otp/verify').send({ phone: rider.phone, code: '000000' });
    const locked = await http.post('/auth/otp/verify').send({ phone: rider.phone, code: '000000' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_LOCKED');

    await call('10.0.0.31').post('/auth/otp/request').send({ phone: rider.phone });
    const ok = await call('10.0.0.32')
      .post('/auth/otp/verify')
      .send({ phone: rider.phone, code: '123456' });
    expect(ok.status).toBe(200);
  });

  it('rate-limits auth routes to 5 per minute per IP', async () => {
    const http = call('10.0.0.4');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await http.post('/auth/login').send({ email: rider.email, password: 'x' });
      statuses.push(response.status);
    }
    expect(statuses[5]).toBe(429);
  });

  it('enforces resource ownership on GET /users/:userId', async () => {
    const a = await call('10.0.0.5').post('/auth/register').send(rider);
    const b = await call('10.0.0.51')
      .post('/auth/register')
      .send({ ...rider, email: 'other@example.com', phone: '+919876543211' });
    const tokenA = a.body.data.accessToken as string;
    const idB = b.body.data.user.id as string;
    const idA = a.body.data.user.id as string;

    const forbidden = await call('10.0.0.52')
      .get(`/users/${idB}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(forbidden.status).toBe(403);

    const own = await call('10.0.0.53')
      .get(`/users/${idA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(own.status).toBe(200);
    expect(own.body.data.user.email).toBe(rider.email);
  });

  it('lets an admin read another user', async () => {
    const a = await call('10.0.0.6').post('/auth/register').send(rider);
    await UserModel.updateOne({ _id: a.body.data.user.id }, { role: 'admin' });
    const login = await call('10.0.0.61')
      .post('/auth/login')
      .send({ email: rider.email, password: rider.password });
    const other = await call('10.0.0.62')
      .post('/auth/register')
      .send({ ...rider, email: 'second@example.com', phone: '+919876543212' });

    const adminRead = await call('10.0.0.63')
      .get(`/users/${other.body.data.user.id}`)
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(adminRead.status).toBe(200);
  });

  it('resets a password from the emailed token and revokes sessions', async () => {
    const registered = await call('10.0.0.7').post('/auth/register').send(rider);
    await call('10.0.0.71').post('/auth/forgot-password').send({ email: rider.email });
    const reset = mailbox.find((item) => item.kind === 'reset');
    expect(reset).toBeTruthy();

    const done = await call('10.0.0.72')
      .post('/auth/reset-password')
      .send({ token: reset?.token, password: 'newpass12' });
    expect(done.status).toBe(200);

    const oldLogin = await call('10.0.0.73')
      .post('/auth/login')
      .send({ email: rider.email, password: rider.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await call('10.0.0.74')
      .post('/auth/login')
      .send({ email: rider.email, password: 'newpass12' });
    expect(newLogin.status).toBe(200);

    const staleRefresh = await call('10.0.0.75')
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${extractCookie(registered, REFRESH_COOKIE)}`);
    expect(staleRefresh.status).toBe(401);
  });

  it('completes Google OAuth using state stored in cache', async () => {
    const start = await call('10.0.0.8').get('/auth/google');
    expect(start.status).toBe(302);
    const location = start.headers.location as string;
    const state = new URL(location).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await call('10.0.0.81').get('/auth/google/callback').query({ code: 'ok', state });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('http://localhost:5173/auth/callback');
    expect(extractCookie(callback, REFRESH_COOKIE)).toBeTruthy();
  });
});
