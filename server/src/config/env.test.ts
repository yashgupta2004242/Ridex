import { loadEnv, resetEnvCache } from './env';

describe('loadEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    PORT: '4000',
    LOG_LEVEL: 'info',
    MONGODB_URI: 'mongodb://localhost:27017/ridex',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGINS: 'http://localhost:5173, http://localhost:4173',
    JWT_ACCESS_SECRET: 'test-access-secret-32-characters-min',
    JWT_REFRESH_SECRET: 'test-refresh-secret-32-characters-min',
    BCRYPT_ROUNDS: '4',
  };

  afterEach(() => {
    resetEnvCache();
  });

  it('parses CORS origins into an allowlist', () => {
    const env = loadEnv(valid);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:4173']);
    expect(env.PORT).toBe(4000);
  });

  it('throws when required secrets are missing', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/Invalid environment configuration/);
  });
});
