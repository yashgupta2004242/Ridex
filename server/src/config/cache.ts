export type CacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  hitSlidingWindow(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; count: number }>;
};

type ZMember = { member: string; score: number };

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

export class MemoryCache implements CacheStore {
  private readonly strings = new Map<string, MemoryEntry>();
  private readonly zsets = new Map<string, ZMember[]>();
  private readonly zExpiry = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.strings.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.strings.delete(key);
    this.zsets.delete(key);
    this.zExpiry.delete(key);
  }

  async hitSlidingWindow(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const now = Date.now();
    const members = (this.zsets.get(key) ?? []).filter((item) => item.score > now - windowMs);
    if (members.length >= limit) {
      this.zsets.set(key, members);
      this.zExpiry.set(key, now + windowMs);
      return { allowed: false, count: members.length };
    }
    members.push({ member: `${now}:${members.length}`, score: now });
    this.zsets.set(key, members);
    this.zExpiry.set(key, now + windowMs);
    return { allowed: true, count: members.length };
  }
}

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  redis.call('PEXPIRE', key, window)
  return {0, count}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1}
`;

type RedisEvalClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
};

export class RedisCache implements CacheStore {
  constructor(private readonly redis: RedisEvalClient) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async hitSlidingWindow(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const now = Date.now();
    const result = await this.redis.eval(
      SLIDING_WINDOW_LUA,
      1,
      key,
      now,
      windowMs,
      limit,
      `${now}:${Math.random()}`,
    );
    const tuple = Array.isArray(result) ? result : [0, 0];
    const allowedFlag = Number(tuple[0]);
    const count = Number(tuple[1]);
    return { allowed: allowedFlag === 1, count };
  }
}

export function createLazyRedisCache(getClient: () => RedisEvalClient): CacheStore {
  let inner: RedisCache | undefined;
  const cache = (): RedisCache => {
    if (!inner) inner = new RedisCache(getClient());
    return inner;
  };
  return {
    get: (key) => cache().get(key),
    set: (key, value, ttl) => cache().set(key, value, ttl),
    del: (key) => cache().del(key),
    hitSlidingWindow: (key, limit, windowMs) => cache().hitSlidingWindow(key, limit, windowMs),
  };
}
