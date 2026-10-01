import type { Redis } from 'ioredis';

export type LockStore = {
  acquire(key: string, token: string, ttlMs: number): Promise<boolean>;
  release(key: string, token: string): Promise<void>;
};

export class MemoryLock implements LockStore {
  private readonly held = new Map<string, { token: string; expiresAt: number }>();

  async acquire(key: string, token: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const current = this.held.get(key);
    if (current && current.expiresAt > now) {
      return false;
    }
    this.held.set(key, { token, expiresAt: now + ttlMs });
    return true;
  }

  async release(key: string, token: string): Promise<void> {
    const current = this.held.get(key);
    if (current?.token === token) {
      this.held.delete(key);
    }
  }
}

const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export class RedisLock implements LockStore {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, token: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async release(key: string, token: string): Promise<void> {
    await this.redis.eval(UNLOCK_LUA, 1, key, token);
  }
}

export function createLazyRedisLock(getClient: () => Redis): LockStore {
  let inner: RedisLock | undefined;
  const lock = (): RedisLock => {
    if (!inner) inner = new RedisLock(getClient());
    return inner;
  };
  return {
    acquire: (key, token, ttlMs) => lock().acquire(key, token, ttlMs),
    release: (key, token) => lock().release(key, token),
  };
}
