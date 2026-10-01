import { LOCATION_MONGO_MS, LOCATION_THROTTLE_MS } from '../common/constants';
import type { DriverPingPort } from './driverPing';
import type { GeoIndex } from './geo';
import { LocationThrottle } from './locationThrottle';

export type LocationUpdate = {
  accepted: boolean;
  persistMongo: boolean;
  point: { lat: number; lng: number };
};

export type LocationRecorder = {
  recordDriverPing(userId: string, point: { lat: number; lng: number }): Promise<void>;
};

export class LocationService {
  constructor(
    private readonly geo: GeoIndex,
    private readonly drivers: DriverPingPort,
    private readonly recorder?: LocationRecorder,
    private readonly throttle = new LocationThrottle(LOCATION_THROTTLE_MS, LOCATION_MONGO_MS),
  ) {}

  async ingest(
    userId: string,
    point: { lat: number; lng: number },
    now = Date.now(),
  ): Promise<LocationUpdate> {
    if (!(await this.drivers.canPing(userId))) {
      await this.drivers.updateLocation(userId, point.lng, point.lat);
      return { accepted: false, persistMongo: true, point };
    }
    const decision = this.throttle.decide(userId, now);
    if (!decision.live) {
      return { accepted: false, persistMongo: false, point };
    }
    await this.geo.add(userId, { lng: point.lng, lat: point.lat });
    if (decision.persistMongo) {
      await this.drivers.updateLocation(userId, point.lng, point.lat);
    }
    await this.recorder?.recordDriverPing(userId, point);
    return { accepted: true, persistMongo: decision.persistMongo, point };
  }

  async drop(userId: string): Promise<void> {
    await this.geo.remove(userId);
  }

  async position(userId: string) {
    return this.geo.position(userId);
  }
}
