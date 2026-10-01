import { MATCH_ROUNDS, SEARCH_RADII_KM } from '../../common/constants';
import { logger } from '../../config/logger';
import type { DriverService } from '../driver/driver.service';
import type { RealtimeHub } from '../../realtime/hub';
import { SOCKET_EVENTS } from '../../realtime/events';
import type { GeoIndex } from '../../realtime/geo';
import type { VehicleType } from '../driver/driver.model';
import { rideLngLat } from '../ride/ride.coords';
import { RideRepository } from '../ride/ride.repository';
import type { RideStatus } from '../ride/rideStateMachine';
import type { Clock } from './clock';
import { realClock } from './clock';
import type { OfferBroker, OfferOutcome } from './offerBroker';
import { matchScore } from './score';

export type MatchingHooks = {
  onOffered?(rideId: string, driverId: string): Promise<void>;
};

export class MatchingService {
  constructor(
    private readonly rides: RideRepository,
    private readonly drivers: DriverService,
    private readonly geo: GeoIndex,
    private readonly hub: RealtimeHub,
    private readonly broker: OfferBroker,
    private readonly offerTimeoutMs: number,
    private readonly clock: Clock = realClock,
    private readonly hooks?: MatchingHooks,
  ) {}

  async run(rideId: string): Promise<void> {
    const offered = new Set<string>();
    for (let round = 0; round < MATCH_ROUNDS; round += 1) {
      const ride = await this.rides.findById(rideId);
      if (!ride || ride.status !== 'SEARCHING') {
        return;
      }
      const pickup = rideLngLat(ride.pickup);
      if (pickup.lng === 0 && pickup.lat === 0 && !ride.pickup?.location) {
        return;
      }
      const widest = SEARCH_RADII_KM[SEARCH_RADII_KM.length - 1] ?? 8;
      const hits = await this.geo.search({ lng: pickup.lng, lat: pickup.lat }, widest);
      for (let index = 0; index < SEARCH_RADII_KM.length; index += 1) {
        const radiusKm = SEARCH_RADII_KM[index] ?? widest;
        const previous = index === 0 ? 0 : (SEARCH_RADII_KM[index - 1] ?? 0);
        const ring = hits.filter((hit) =>
          index === 0 ? hit.distanceKm <= radiusKm : hit.distanceKm > previous && hit.distanceKm <= radiusKm,
        );
        const profiles = await this.drivers.listMatchable(
          ring.map((hit) => hit.member),
          ride.vehicleType as VehicleType,
        );
        const busy = await this.rides.listBusyDriverIds(profiles.map((row) => row.userId));
        const ranked = profiles
          .filter((row) => !busy.has(row.userId) && !offered.has(row.userId))
          .map((row) => {
            const hit = ring.find((item) => item.member === row.userId);
            return {
              ...row,
              distanceKm: hit?.distanceKm ?? radiusKm,
              radiusKm,
            };
          })
          .sort(
            (left, right) =>
              matchScore(right) - matchScore(left),
          );

        for (const candidate of ranked) {
          const current = await this.rides.findById(rideId);
          if (!current || current.status !== 'SEARCHING') {
            return;
          }
          offered.add(candidate.userId);
          const outcome = await this.offer(current.id, candidate.userId, {
            rideId: current.id,
            rideCode: current.rideCode,
            pickup: current.pickup,
            drop: current.drop,
            fareTotal: current.fare?.total ?? 0,
            distanceKm: candidate.distanceKm,
            timeoutMs: this.offerTimeoutMs,
            path: (current.path ?? []).map((point) => [point.lng, point.lat]),
          });
          await this.drivers.recordOffer(candidate.userId, outcome === 'accepted');
          if (outcome === 'accepted') {
            return;
          }
        }
      }
    }

    const leftover = await this.rides.findById(rideId);
    if (leftover && leftover.status === 'SEARCHING') {
      this.rides.apply(leftover, 'NO_DRIVERS_FOUND', 'system');
      await this.rides.save(leftover);
      this.hub.emitToUser(leftover.riderId.toString(), SOCKET_EVENTS.RIDE_STATUS, {
        rideId,
        status: leftover.status,
      });
      logger.info('Matching exhausted', { rideId });
    }
  }

  private async offer(
    rideId: string,
    driverId: string,
    payload: Record<string, unknown>,
  ): Promise<OfferOutcome> {
    const pending = this.broker.wait(rideId, driverId);
    this.hub.emitToUser(driverId, SOCKET_EVENTS.RIDE_OFFER, payload);
    if (this.hooks?.onOffered) {
      await this.hooks.onOffered(rideId, driverId);
    }
    void this.clock.sleep(this.offerTimeoutMs).then(() => {
      this.broker.timeout(rideId, driverId);
    });
    return pending;
  }
}

export type { RideStatus };
