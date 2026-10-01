import { calculateFare, rupees, DEFAULT_RATES } from './fare';

describe('calculateFare', () => {
  it('charges base even for a zero-length trip', () => {
    const fare = calculateFare({
      distanceMeters: 0,
      durationSeconds: 0,
      rates: DEFAULT_RATES.bike,
      surgeMultiplier: 1,
    });
    expect(fare.base).toBe(25);
    expect(fare.distance).toBe(0);
    expect(fare.time).toBe(0);
    expect(fare.surge).toBe(0);
    expect(fare.platformFee).toBe(5);
    expect(fare.tax).toBe(rupees(30 * 0.05));
    expect(fare.total).toBe(rupees(30 + fare.tax));
  });

  it('adds distance and time line items', () => {
    const fare = calculateFare({
      distanceMeters: 5000,
      durationSeconds: 600,
      rates: DEFAULT_RATES.sedan,
      surgeMultiplier: 1,
    });
    expect(fare.distance).toBe(75);
    expect(fare.time).toBe(20);
    expect(fare.base).toBe(60);
    expect(fare.surge).toBe(0);
  });

  it('puts surge on the ride subtotal, not on the platform fee', () => {
    const fare = calculateFare({
      distanceMeters: 1000,
      durationSeconds: 60,
      rates: DEFAULT_RATES.bike,
      surgeMultiplier: 2,
    });
    const subtotal = 25 + 8 + 1;
    expect(fare.surge).toBe(subtotal);
    expect(fare.platformFee).toBe(5);
    expect(fare.total).toBe(rupees(subtotal * 2 + 5 + (subtotal * 2 + 5) * 0.05));
  });

  it('rounds every line to paise', () => {
    const fare = calculateFare({
      distanceMeters: 333,
      durationSeconds: 40,
      rates: { baseFare: 10, perKm: 7, perMinute: 3, platformFee: 1, taxRate: 0.05 },
      surgeMultiplier: 1.15,
    });
    for (const value of Object.values(fare)) {
      expect(Number.isInteger(rupees(value * 100))).toBe(true);
    }
  });
});
