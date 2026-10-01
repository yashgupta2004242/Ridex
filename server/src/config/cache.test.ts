import { MemoryCache } from './cache';

describe('MemoryCache sliding window', () => {
  it('allows the first N hits and blocks the next', async () => {
    const cache = new MemoryCache();
    const key = 'rl:auth:1.1.1.1';
    const results = [];
    for (let i = 0; i < 6; i += 1) {
      results.push(await cache.hitSlidingWindow(key, 5, 60_000));
    }
    expect(results.slice(0, 5).every((item) => item.allowed)).toBe(true);
    expect(results[5]?.allowed).toBe(false);
  });
});
