export class LocationThrottle {
  private readonly lastLive = new Map<string, number>();
  private readonly lastMongo = new Map<string, number>();

  constructor(
    private readonly liveEveryMs: number,
    private readonly mongoEveryMs: number,
  ) {}

  decide(member: string, now: number): { live: boolean; persistMongo: boolean } {
    const previousLive = this.lastLive.get(member);
    if (previousLive !== undefined && now - previousLive < this.liveEveryMs) {
      return { live: false, persistMongo: false };
    }
    this.lastLive.set(member, now);
    const previousMongo = this.lastMongo.get(member);
    const persistMongo = previousMongo === undefined || now - previousMongo >= this.mongoEveryMs;
    if (persistMongo) {
      this.lastMongo.set(member, now);
    }
    return { live: true, persistMongo };
  }
}
