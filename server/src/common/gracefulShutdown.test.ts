import { createGracefulShutdown } from './gracefulShutdown';

describe('createGracefulShutdown', () => {
  it('closes HTTP then Redis then Mongo exactly once', async () => {
    const order: string[] = [];
    const shutdown = createGracefulShutdown({
      closeHttp: (callback) => {
        order.push('http');
        callback();
      },
      disconnectRedis: async () => {
        order.push('redis');
      },
      disconnectMongo: async () => {
        order.push('mongo');
      },
      exit: (code) => {
        order.push(`exit:${code}`);
      },
    });

    await shutdown('SIGTERM');
    await shutdown('SIGTERM');

    expect(order).toEqual(['http', 'redis', 'mongo', 'exit:0']);
  });
});
