import { SavedPlaceModel, type SavedPlaceDocument } from './savedPlace.model';

export class SavedPlaceRepository {
  async list(userId: string): Promise<SavedPlaceDocument[]> {
    return SavedPlaceModel.find({ userId }).sort({ updatedAt: -1 });
  }

  async create(userId: string, input: { label: string; address: string; lng: number; lat: number }) {
    return SavedPlaceModel.create({
      userId,
      label: input.label,
      address: input.address,
      location: { type: 'Point', coordinates: [input.lng, input.lat] },
    });
  }
}
