import type { VehicleType } from '../driver/driver.model';
import { VEHICLE_TYPES } from '../driver/driver.model';
import { DEFAULT_RATES, type VehicleRates } from './fare';
import { PricingConfigModel } from './pricing.model';

export class PricingRepository {
  async getRates(): Promise<Record<VehicleType, VehicleRates>> {
    const existing = await PricingConfigModel.findOne({ key: 'default' });
    if (!existing) {
      await PricingConfigModel.create({ key: 'default', currency: 'INR', rates: DEFAULT_RATES });
      return { ...DEFAULT_RATES };
    }
    const stored = existing.rates as Partial<Record<VehicleType, VehicleRates>>;
    const rates = { ...DEFAULT_RATES };
    for (const type of VEHICLE_TYPES) {
      const row = stored[type];
      if (row) rates[type] = row;
    }
    return rates;
  }
}
