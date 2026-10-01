export const SOCKET_EVENTS = {
  DRIVER_LOCATION: 'driver:location',
  RIDE_OFFER: 'ride:offer',
  RIDE_ACCEPTED: 'ride:accepted',
  RIDE_STATUS: 'ride:statusChanged',
  RIDE_COMPLETED: 'ride:completed',
  RIDE_CANCELLED: 'ride:cancelled',
  RIDE_SYNC: 'ride:sync',
} as const;

export type RideOfferPayload = {
  rideId: string;
  rideCode: string;
  fareTotal: number;
  distanceKm: number;
  timeoutMs: number;
  pickup: unknown;
  drop: unknown;
  path?: [number, number][];
};

export type RideSyncPayload = {
  rideId: string;
  status: string;
  riderId: string;
  driverId: string | null;
} | null;
