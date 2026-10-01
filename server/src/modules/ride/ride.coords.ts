import type { RideDocument } from './ride.model';

export function rideLngLat(place: RideDocument['pickup'] | RideDocument['drop']): {
  lng: number;
  lat: number;
  address: string;
} {
  const coordinates = place?.location?.coordinates ?? [];
  return {
    lng: coordinates[0] ?? 0,
    lat: coordinates[1] ?? 0,
    address: place?.address ?? '',
  };
}
