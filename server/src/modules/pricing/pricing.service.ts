import {
  ESTIMATE_CACHE_TTL_SECONDS,
  GEOHASH_PRECISION,
  SURGE_WINDOW_MS,
} from '../../common/constants';
import type { CacheStore } from '../../config/cache';
import { VEHICLE_TYPES, type VehicleType } from '../driver/driver.model';
import { calculateFare, type FareBreakdown } from './fare';
import { encodeGeohash } from './geohash';
import { PricingRepository } from './pricing.repository';
import type { EstimateInput } from './pricing.dto';
import type { RoutingPort } from './routing';
import { surgeMultiplier } from './surge';

export type VehicleQuote = FareBreakdown & { vehicleType: VehicleType };

export type EstimateResult = {
  distanceMeters: number;
  durationSeconds: number;
  geohash: string;
  quotes: VehicleQuote[];
  path: [number, number][];
};

export class PricingService {
  constructor(
    private readonly cache: CacheStore,
    private readonly routing: RoutingPort,
    private readonly pricing: PricingRepository,
  ) {}

  async estimate(input: EstimateInput): Promise<EstimateResult> {
    const geohash = encodeGeohash(input.pickup.lat, input.pickup.lng, GEOHASH_PRECISION);
    const demandHit = await this.cache.hitSlidingWindow(`surge:demand:${geohash}`, 1_000_000, SURGE_WINDOW_MS);
    const supplyRaw = await this.cache.get(`surge:supply:${geohash}`);
    const supply = supplyRaw ? Number(supplyRaw) : 1;
    const multiplier = surgeMultiplier(demandHit.count, Number.isFinite(supply) ? supply : 1);

    const osrmKey = `osrm:${roundCoord(input.pickup.lat)}:${roundCoord(input.pickup.lng)}:${roundCoord(input.drop.lat)}:${roundCoord(input.drop.lng)}`;
    const cached = await this.cache.get(osrmKey);
    let distanceMeters: number;
    let durationSeconds: number;
    let coordinates: [number, number][];
    if (cached) {
      const parsed = JSON.parse(cached) as {
        distanceMeters: number;
        durationSeconds: number;
        coordinates?: [number, number][];
      };
      distanceMeters = parsed.distanceMeters;
      durationSeconds = parsed.durationSeconds;
      coordinates = parsed.coordinates ?? [
        [input.pickup.lng, input.pickup.lat],
        [input.drop.lng, input.drop.lat],
      ];
    } else {
      const leg = await this.routing.route(input.pickup, input.drop);
      distanceMeters = leg.distanceMeters;
      durationSeconds = leg.durationSeconds;
      coordinates = leg.coordinates;
      await this.cache.set(osrmKey, JSON.stringify(leg), ESTIMATE_CACHE_TTL_SECONDS);
    }

    const rates = await this.pricing.getRates();
    const quotes = VEHICLE_TYPES.map((vehicleType) => ({
      vehicleType,
      ...calculateFare({
        distanceMeters,
        durationSeconds,
        rates: rates[vehicleType],
        surgeMultiplier: multiplier,
      }),
    }));

    return { distanceMeters, durationSeconds, geohash, quotes, path: coordinates };
  }

  async setSupply(geohash: string, driversOnline: number): Promise<void> {
    await this.cache.set(`surge:supply:${geohash}`, String(Math.max(0, driversOnline)), 300);
  }
}

function roundCoord(value: number): string {
  return value.toFixed(4);
}
