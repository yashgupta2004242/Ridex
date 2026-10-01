import { existsSync } from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.LOG_LEVEL = 'error';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ridex-test';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-characters-min';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-min';
process.env.BCRYPT_ROUNDS = '4';
process.env.CLIENT_URL = 'http://localhost:5173';

const localMongod = [
  process.env.MONGOMS_SYSTEM_BINARY,
  'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe',
  'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
].find((path) => path && existsSync(path));
if (localMongod) {
  process.env.MONGOMS_SYSTEM_BINARY = localMongod;
}
