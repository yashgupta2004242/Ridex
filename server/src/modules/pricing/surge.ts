import { SURGE_CAP } from '../../common/constants';

export function surgeMultiplier(demand: number, supply: number, cap = SURGE_CAP): number {
  if (demand <= 0) return 1;
  if (supply <= 0) return cap;
  const ratio = demand / supply;
  const raw = Math.min(cap, Math.max(1, ratio));
  return Math.round(raw * 100) / 100;
}
