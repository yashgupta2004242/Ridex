import { MemoryGeo } from './geo';

describe('MemoryGeo', () => {
  it('stores, reads, and removes a member', async () => {
    const geo = new MemoryGeo();
    await geo.add('driver-1', { lng: 77.2, lat: 28.6 });
    expect(await geo.position('driver-1')).toEqual({ lng: 77.2, lat: 28.6 });
    await geo.remove('driver-1');
    expect(await geo.position('driver-1')).toBeNull();
  });

  it('returns members inside a radius sorted by distance', async () => {
    const geo = new MemoryGeo();
    await geo.add('near', { lng: 77.21, lat: 28.61 });
    await geo.add('far', { lng: 77.25, lat: 28.65 });
    const hits = await geo.search({ lng: 77.2, lat: 28.6 }, 20);
    expect(hits[0]?.member).toBe('near');
    expect(hits.some((hit) => hit.member === 'far')).toBe(true);
    const tight = await geo.search({ lng: 77.2, lat: 28.6 }, 2);
    expect(tight.map((hit) => hit.member)).toEqual(['near']);
  });
});
