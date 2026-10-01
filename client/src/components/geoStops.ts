import type { MapPoint } from './RideMap';

export function stopToPoint(raw: unknown, label: string): MapPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as {
    address?: string;
    lat?: number;
    lng?: number;
    location?: { coordinates?: number[] };
  };
  const lng = row.lng ?? row.location?.coordinates?.[0];
  const lat = row.lat ?? row.location?.coordinates?.[1];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng, label: row.address || label };
}

export function toMapPath(
  points?: { lat: number; lng: number }[] | [number, number][] | null,
): [number, number][] {
  if (!points?.length) return [];
  const first = points[0];
  if (Array.isArray(first)) {
    return (points as [number, number][]).filter((pair) => pair.length >= 2);
  }
  return (points as { lat: number; lng: number }[]).map((point) => [point.lng, point.lat]);
}
