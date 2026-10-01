import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';
import type { Env } from '../../config/env';

export type LatLng = { lat: number; lng: number };

export type RouteLeg = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
};

export type RoutingPort = {
  route(from: LatLng, to: LatLng): Promise<RouteLeg>;
};

type OsrmResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
  }[];
};

export class OsrmClient implements RoutingPort {
  constructor(private readonly env: Env) {}

  async route(from: LatLng, to: LatLng): Promise<RouteLeg> {
    const url = `${this.env.OSRM_BASE_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new AppError(HTTP.SERVICE_UNAVAILABLE, ERROR_CODES.ROUTING_FAILED, 'Could not fetch a road route. Try again.');
    }
    const body = (await response.json()) as OsrmResponse;
    const first = body.routes?.[0];
    if (body.code !== 'Ok' || !first) {
      throw new AppError(HTTP.BAD_REQUEST, ERROR_CODES.ROUTING_FAILED, 'No driving route between those points');
    }
    const coordinates = first.geometry?.coordinates?.filter(
      (pair): pair is [number, number] => Array.isArray(pair) && pair.length >= 2,
    ) ?? [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];
    return {
      distanceMeters: first.distance,
      durationSeconds: first.duration,
      coordinates,
    };
  }
}

export class StaticRouter implements RoutingPort {
  constructor(
    private readonly leg: { distanceMeters: number; durationSeconds: number; coordinates?: [number, number][] },
  ) {}

  async route(from: LatLng, to: LatLng): Promise<RouteLeg> {
    return {
      ...this.leg,
      coordinates: this.leg.coordinates?.length
        ? this.leg.coordinates
        : [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
    };
  }
}
