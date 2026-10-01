export type DriverPingPort = {
  canPing(userId: string): Promise<boolean>;
  updateLocation(userId: string, lng: number, lat: number): Promise<void>;
};
