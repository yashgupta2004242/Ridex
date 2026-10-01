import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo: MongoMemoryServer | undefined;

export async function startTestMongo(): Promise<string> {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);
  return uri;
}

export async function stopTestMongo(): Promise<void> {
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
    mongo = undefined;
  }
}

export async function resetTestMongo(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
