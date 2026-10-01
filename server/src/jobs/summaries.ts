import { logger } from '../config/logger';
import type { LlmPort } from '../modules/ai/llm';
import { RatingModel } from '../modules/rating/rating.model';
import { RideModel } from '../modules/ride/ride.model';

export async function summarizeRide(rideId: string, llm: LlmPort): Promise<void> {
  const ride = await RideModel.findById(rideId);
  if (!ride || ride.status !== 'COMPLETED') return;
  const rating = await RatingModel.findOne({ rideId: ride._id });
  try {
    const result = await llm.complete(
      [
        {
          role: 'system',
          content:
            'Write one short trip summary for a history list. If a comment exists, also reply with JSON {"summary","sentiment","aspects":["driving"|"cleanliness"|"behaviour"|"punctuality"],"safetyFlag":boolean}.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            pickup: ride.pickup?.address ?? '',
            drop: ride.drop?.address ?? '',
            fare: ride.fare?.total ?? 0,
            comment: rating?.comment ?? '',
            score: rating?.score ?? null,
          }),
        },
      ],
      [],
    );
    ride.summary = result.text.slice(0, 180);
    await ride.save();
  } catch (error) {
    ride.summary = `${ride.pickup?.address || 'Pickup'} → ${ride.drop?.address || 'drop'} · ₹${ride.fare?.total ?? 0}`;
    await ride.save();
    logger.warn('Trip summary fallback', { rideId, error: error instanceof Error ? error.message : error });
  }
}

export async function summarizePendingRides(llm: LlmPort): Promise<number> {
  const rides = await RideModel.find({ status: 'COMPLETED', summary: '' }).limit(40);
  for (const ride of rides) {
    await summarizeRide(ride.id, llm);
  }
  return rides.length;
}
