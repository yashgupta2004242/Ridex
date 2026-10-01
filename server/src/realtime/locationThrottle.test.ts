import { LocationThrottle } from './locationThrottle';

describe('LocationThrottle', () => {
  const throttle = new LocationThrottle(4000, 30_000);

  it('accepts the first ping and asks for a Mongo write', () => {
    expect(throttle.decide('d1', 0)).toEqual({ live: true, persistMongo: true });
  });

  it('drops pings inside the live window', () => {
    throttle.decide('d2', 1000);
    expect(throttle.decide('d2', 4999)).toEqual({ live: false, persistMongo: false });
    expect(throttle.decide('d2', 5000)).toEqual({ live: true, persistMongo: false });
  });

  it('asks Mongo again after 30 seconds of accepted live pings', () => {
    throttle.decide('d3', 0);
    expect(throttle.decide('d3', 30_000)).toEqual({ live: true, persistMongo: true });
  });
});
