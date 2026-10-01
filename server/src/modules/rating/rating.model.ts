import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const ratingSchema = new Schema(
  {
    rideId: { type: Schema.Types.ObjectId, ref: 'Ride', required: true, unique: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
  },
  { timestamps: true },
);

export type RatingDocument = HydratedDocument<InferSchemaType<typeof ratingSchema>>;

export const RatingModel = model('Rating', ratingSchema);
