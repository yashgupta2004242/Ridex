import { MemoryLock } from './lock';

describe('MemoryLock', () => {
  it('is exclusive until release or expiry', async () => {
    const locks = new MemoryLock();
    await expect(locks.acquire('lock:ride:1', 'a', 5_000)).resolves.toBe(true);
    await expect(locks.acquire('lock:ride:1', 'b', 5_000)).resolves.toBe(false);
    await locks.release('lock:ride:1', 'b');
    await expect(locks.acquire('lock:ride:1', 'b', 5_000)).resolves.toBe(false);
    await locks.release('lock:ride:1', 'a');
    await expect(locks.acquire('lock:ride:1', 'b', 5_000)).resolves.toBe(true);
  });
});
