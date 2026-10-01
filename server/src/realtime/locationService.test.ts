import { LocationService } from './locationService';
import { MemoryGeo } from './geo';
import type { DriverPingPort } from './driverPing';

describe('LocationService', () => {
  const geo = new MemoryGeo();
  const writes: { lng: number; lat: number }[] = [];
  const drivers: DriverPingPort = {
    async canPing(userId) {
      return userId === 'online';
    },
    async updateLocation(_userId, lng, lat) {
      writes.push({ lng, lat });
    },
  };
  const locations = new LocationService(geo, drivers);

  beforeEach(() => {
    writes.length = 0;
  });

  it('ignores drivers who are not allowed to ping', async () => {
    const result = await locations.ingest('offline', { lat: 28.6, lng: 77.2 }, 0);
    expect(result.accepted).toBe(false);
    expect(await geo.position('offline')).toBeNull();
  });

  it('GEOADDs immediately and writes Mongo on the first accepted ping', async () => {
    const result = await locations.ingest('online', { lat: 28.61, lng: 77.21 }, 0);
    expect(result.accepted).toBe(true);
    expect(result.persistMongo).toBe(true);
    expect(await geo.position('online')).toEqual({ lat: 28.61, lng: 77.21 });
    expect(writes).toEqual([{ lng: 77.21, lat: 28.61 }]);
  });
});
