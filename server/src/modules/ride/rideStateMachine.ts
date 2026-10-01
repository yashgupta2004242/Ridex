import { AppError } from '../../common/AppError';
import { ERROR_CODES, HTTP } from '../../common/constants';

export const RIDE_STATUSES = [
  'REQUESTED',
  'SEARCHING',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED_BY_RIDER',
  'CANCELLED_BY_DRIVER',
  'NO_DRIVERS_FOUND',
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'SEARCHING',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
];

const TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  REQUESTED: ['SEARCHING', 'CANCELLED_BY_RIDER'],
  SEARCHING: ['DRIVER_ASSIGNED', 'NO_DRIVERS_FOUND', 'CANCELLED_BY_RIDER'],
  DRIVER_ASSIGNED: ['DRIVER_ARRIVING', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER'],
  DRIVER_ARRIVING: ['DRIVER_ARRIVED', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER'],
  DRIVER_ARRIVED: ['IN_PROGRESS', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED_BY_RIDER: [],
  CANCELLED_BY_DRIVER: [],
  NO_DRIVERS_FOUND: [],
};

export class RideStateMachine {
  can(from: RideStatus, to: RideStatus): boolean {
    return TRANSITIONS[from].includes(to);
  }

  assert(from: RideStatus, to: RideStatus): void {
    if (!this.can(from, to)) {
      throw new AppError(
        HTTP.CONFLICT,
        ERROR_CODES.INVALID_TRANSITION,
        `Cannot move a ride from ${from} to ${to}`,
      );
    }
  }
}

export const rideStateMachine = new RideStateMachine();
