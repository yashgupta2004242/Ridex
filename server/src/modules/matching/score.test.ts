import { matchScore } from './score';

describe('matchScore', () => {
  it('weights distance more than rating', () => {
    const close = matchScore({ distanceKm: 0.5, radiusKm: 3, rating: 3, acceptanceRate: 0.5 });
    const farStar = matchScore({ distanceKm: 3, radiusKm: 3, rating: 5, acceptanceRate: 1 });
    expect(close).toBeGreaterThan(farStar);
  });
});
