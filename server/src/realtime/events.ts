export const SOCKET_EVENTS = {
  DRIVER_LOCATION: 'driver:location',
  RIDE_OFFER: 'ride:offer',
  RIDE_ACCEPTED: 'ride:accepted',
  RIDE_STATUS: 'ride:statusChanged',
  RIDE_COMPLETED: 'ride:completed',
  RIDE_CANCELLED: 'ride:cancelled',
  RIDE_SYNC: 'ride:sync',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function rideRoom(rideId: string): string {
  return `ride:${rideId}`;
}
