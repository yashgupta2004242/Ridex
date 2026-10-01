export type RideSnapshot = {
  rideId: string;
  status: string;
  riderId: string;
  driverId: string | null;
};

export type RideSyncPort = {
  getActiveForUser(userId: string): Promise<RideSnapshot | null>;
};

export const emptyRideSync: RideSyncPort = {
  async getActiveForUser() {
    return null;
  },
};
