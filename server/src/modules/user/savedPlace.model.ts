import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const savedPlaceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
  },
  { timestamps: true },
);

export type SavedPlaceDocument = HydratedDocument<InferSchemaType<typeof savedPlaceSchema>>;
export const SavedPlaceModel = model('SavedPlace', savedPlaceSchema);
