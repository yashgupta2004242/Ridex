import type { VehicleType } from '../driver/driver.model';

export type VehicleRates = {
  baseFare: number;
  perKm: number;
  perMinute: number;
  platformFee: number;
  taxRate: number;
};

export type FareBreakdown = {
  base: number;
  distance: number;
  time: number;
  surge: number;
  platformFee: number;
  tax: number;
  total: number;
  surgeMultiplier: number;
};

export function rupees(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateFare(input: {
  distanceMeters: number;
  durationSeconds: number;
  rates: VehicleRates;
  surgeMultiplier: number;
}): FareBreakdown {
  const km = Math.max(0, input.distanceMeters) / 1000;
  const minutes = Math.max(0, input.durationSeconds) / 60;
  const base = rupees(input.rates.baseFare);
  const distance = rupees(km * input.rates.perKm);
  const time = rupees(minutes * input.rates.perMinute);
  const multiplier = Math.max(1, input.surgeMultiplier);
  const rideSubtotal = rupees(base + distance + time);
  const surgedSubtotal = rupees(rideSubtotal * multiplier);
  const surge = rupees(surgedSubtotal - rideSubtotal);
  const platformFee = rupees(input.rates.platformFee);
  const taxable = rupees(surgedSubtotal + platformFee);
  const tax = rupees(taxable * input.rates.taxRate);
  const total = rupees(taxable + tax);
  return {
    base,
    distance,
    time,
    surge,
    platformFee,
    tax,
    total,
    surgeMultiplier: rupees(multiplier),
  };
}

export const DEFAULT_RATES: Record<VehicleType, VehicleRates> = {
  bike: { baseFare: 25, perKm: 8, perMinute: 1, platformFee: 5, taxRate: 0.05 },
  auto: { baseFare: 40, perKm: 12, perMinute: 1.5, platformFee: 8, taxRate: 0.05 },
  sedan: { baseFare: 60, perKm: 15, perMinute: 2, platformFee: 10, taxRate: 0.05 },
  suv: { baseFare: 90, perKm: 20, perMinute: 2.5, platformFee: 12, taxRate: 0.05 },
};
