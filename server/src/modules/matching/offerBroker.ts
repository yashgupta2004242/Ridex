export type OfferOutcome = 'accepted' | 'declined' | 'timeout';

type Waiter = {
  driverId: string;
  resolve: (outcome: OfferOutcome) => void;
};

export class OfferBroker {
  private readonly waiters = new Map<string, Waiter>();

  wait(rideId: string, driverId: string): Promise<OfferOutcome> {
    return new Promise((resolve) => {
      this.waiters.set(rideId, {
        driverId,
        resolve: (outcome) => {
          this.waiters.delete(rideId);
          resolve(outcome);
        },
      });
    });
  }

  resolve(rideId: string, driverId: string, outcome: Exclude<OfferOutcome, 'timeout'>): boolean {
    const waiter = this.waiters.get(rideId);
    if (!waiter || waiter.driverId !== driverId) {
      return false;
    }
    waiter.resolve(outcome);
    return true;
  }

  timeout(rideId: string, driverId: string): void {
    const waiter = this.waiters.get(rideId);
    if (!waiter || waiter.driverId !== driverId) return;
    waiter.resolve('timeout');
  }
}
