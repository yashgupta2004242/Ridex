export function matchScore(input: {
  distanceKm: number;
  radiusKm: number;
  rating: number;
  acceptanceRate: number;
}): number {
  const proximity = 1 - Math.min(1, Math.max(0, input.distanceKm) / Math.max(input.radiusKm, 0.001));
  const rating = Math.min(1, Math.max(0, input.rating / 5));
  const acceptance = Math.min(1, Math.max(0, input.acceptanceRate));
  return 0.6 * proximity + 0.25 * rating + 0.15 * acceptance;
}
