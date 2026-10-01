import { encodeGeohash } from './geohash';

describe('encodeGeohash', () => {
  it('matches a published example at precision 6', () => {
    expect(encodeGeohash(57.64911, 10.40744, 6)).toBe('u4pruy');
  });

  it('keeps nearby metres in the same cell and a far point in another', () => {
    const a = encodeGeohash(28.6328, 77.2197, 6);
    const nearby = encodeGeohash(28.6331, 77.2199, 6);
    const far = encodeGeohash(19.076, 72.8777, 6);
    expect(nearby).toBe(a);
    expect(far).not.toBe(a);
    expect(a).toHaveLength(6);
  });
});
