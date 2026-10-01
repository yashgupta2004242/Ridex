export type GeoHit = { member: string; distanceKm: number };

export type GeoPoint = { lng: number; lat: number };

export type GeoIndex = {
  add(member: string, point: GeoPoint): Promise<void>;
  position(member: string): Promise<GeoPoint | null>;
  remove(member: string): Promise<void>;
  search(point: GeoPoint, radiusKm: number): Promise<GeoHit[]>;
};

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export class MemoryGeo implements GeoIndex {
  private readonly points = new Map<string, GeoPoint>();

  async add(member: string, point: GeoPoint): Promise<void> {
    this.points.set(member, point);
  }

  async position(member: string): Promise<GeoPoint | null> {
    return this.points.get(member) ?? null;
  }

  async remove(member: string): Promise<void> {
    this.points.delete(member);
  }

  async search(point: GeoPoint, radiusKm: number): Promise<GeoHit[]> {
    const hits: GeoHit[] = [];
    for (const [member, location] of this.points) {
      const distanceKm = haversineKm(point, location);
      if (distanceKm <= radiusKm) {
        hits.push({ member, distanceKm });
      }
    }
    return hits.sort((a, b) => a.distanceKm - b.distanceKm);
  }
}

type RedisGeoClient = {
  geoadd(key: string, lng: number, lat: number, member: string): Promise<unknown>;
  geopos(key: string, member: string): Promise<(string[] | null)[] | null>;
  zrem(key: string, member: string): Promise<unknown>;
  geosearch(
    key: string,
    ...args: (string | number)[]
  ): Promise<unknown[]>;
};

export class RedisGeo implements GeoIndex {
  constructor(
    private readonly getClient: () => RedisGeoClient,
    private readonly key: string,
  ) {}

  async add(member: string, point: GeoPoint): Promise<void> {
    await this.getClient().geoadd(this.key, point.lng, point.lat, member);
  }

  async position(member: string): Promise<GeoPoint | null> {
    const result = await this.getClient().geopos(this.key, member);
    const pair = result?.[0];
    if (!pair || pair.length < 2 || pair[0] === undefined || pair[1] === undefined) {
      return null;
    }
    return { lng: Number(pair[0]), lat: Number(pair[1]) };
  }

  async remove(member: string): Promise<void> {
    await this.getClient().zrem(this.key, member);
  }

  async search(point: GeoPoint, radiusKm: number): Promise<GeoHit[]> {
    const raw = await this.getClient().geosearch(
      this.key,
      'FROMLONLAT',
      point.lng,
      point.lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'WITHDIST',
    );
    return parseGeoSearch(raw);
  }
}

export function parseGeoSearch(raw: unknown[]): GeoHit[] {
  const hits: GeoHit[] = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length >= 2) {
      hits.push({ member: String(row[0]), distanceKm: Number(row[1]) });
    }
  }
  return hits;
}
