import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { VehicleType } from '../driver/driver.model';
import type { VehicleRates } from './fare';

const pricingConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    currency: { type: String, default: 'INR' },
    rates: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export type PricingConfigDocument = HydratedDocument<InferSchemaType<typeof pricingConfigSchema>>;

export const PricingConfigModel = model('PricingConfig', pricingConfigSchema);

export type StoredRates = Record<VehicleType, VehicleRates>;
