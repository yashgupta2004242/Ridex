import { RideStateMachine } from '../ride/rideStateMachine';
import { AppError } from '../../common/AppError';

describe('RideStateMachine', () => {
  const machine = new RideStateMachine();

  it('allows SEARCHING to DRIVER_ASSIGNED and forbids IN_PROGRESS from SEARCHING', () => {
    expect(machine.can('SEARCHING', 'DRIVER_ASSIGNED')).toBe(true);
    expect(() => machine.assert('SEARCHING', 'IN_PROGRESS')).toThrow(AppError);
  });

  it('requires OTP gate: DRIVER_ARRIVED to IN_PROGRESS, not skip from ARRIVING', () => {
    expect(machine.can('DRIVER_ARRIVED', 'IN_PROGRESS')).toBe(true);
    expect(machine.can('DRIVER_ARRIVING', 'IN_PROGRESS')).toBe(false);
  });
});
