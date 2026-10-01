import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectMongo, disconnectMongo, pingMongo } from './db';

describe('connectMongo', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo();
    await mongo.stop();
  }, 30_000);

  it('connects with retry-capable wrapper and answers ping', async () => {
    await connectMongo(mongo.getUri());
    await expect(pingMongo()).resolves.toBe(true);
  }, 60_000);
});
