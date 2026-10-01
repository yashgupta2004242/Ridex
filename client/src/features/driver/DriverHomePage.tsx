import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { BrandMark } from '../../components/BrandMark';
import { RideMap } from '../../components/RideMap';
import { ROAD_PHOTO } from '../../components/RoadArt';
import { stopToPoint, toMapPath } from '../../components/geoStops';
import type { RootState } from '../../app/store';
import {
  useAcceptRideMutation,
  useDeclineRideMutation,
  useEarningsQuery,
  useGetDriverMeQuery,
  useSetDriverOnlineMutation,
} from '../api';
import { SOCKET_EVENTS } from '../realtime/events';
import { useSocket } from '../realtime/useSocket';

function stopLabel(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return 'Unknown stop';
  const row = raw as { address?: string; location?: { coordinates?: number[] } };
  if (row.address) return row.address;
  const lng = row.location?.coordinates?.[0];
  const lat = row.location?.coordinates?.[1];
  if (lat !== undefined && lng !== undefined) return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  return 'Unknown stop';
}

export function DriverHomePage() {
  const user = useSelector((state: RootState) => state.session.user);
  const { data, refetch, isFetching } = useGetDriverMeQuery(undefined, { skip: user?.role !== 'driver' });
  const { data: pay } = useEarningsQuery(undefined, { skip: user?.role !== 'driver' });
  const [setOnline, { isLoading: toggling }] = useSetDriverOnlineMutation();
  const [accept] = useAcceptRideMutation();
  const [decline] = useDeclineRideMutation();
  const { connected, lastSync, offer, socket, dismissOffer } = useSocket();
  const navigate = useNavigate();
  const [gpsOk, setGpsOk] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      () => setGpsOk(true),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 8_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'driver') return <Navigate to="/" replace />;

  const driver = data?.driver;
  const online = driver?.isOnline ?? false;
  const approved = driver?.verificationStatus === 'approved';
  const remainingMs = offer ? Math.max(0, offer.expiresAt - now) : 0;
  const canAccept = Boolean(online && approved && gpsOk && connected);
  const drain = offer ? remainingMs / (offer.timeoutMs || 15_000) : 0;

  async function pingAndGoOnline() {
    setActionError(null);
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('no-gps'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8_000,
      });
    });
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    setGpsOk(true);
    await setOnline({ isOnline: true, lat, lng }).unwrap();
    socket?.emit(SOCKET_EVENTS.DRIVER_LOCATION, { lat, lng });
    await refetch();
  }

  async function goOffline() {
    setActionError(null);
    await setOnline({ isOnline: false }).unwrap();
    await refetch();
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="relative h-40 overflow-hidden">
        <img src={ROAD_PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-night/70" />
        <div className="relative flex h-full flex-col justify-end px-6 pb-5 text-white">
          <BrandMark light />
          <h1 className="mt-1 font-display text-3xl font-semibold">Driver home</h1>
          <p className="mt-1 text-sm text-white/80">
            {canAccept
              ? 'Online — you can accept a ride request'
              : online
                ? 'Online, but GPS or socket is not ready'
                : 'Offline — not receiving ride requests'}
          </p>
        </div>
      </header>

      <section className="px-6 py-6">
        <div className="grid max-w-lg gap-2 sm:grid-cols-2">
          <StatusChip
            ok={online}
            label={online ? 'Online' : 'Offline'}
            detail={online ? 'Visible to matching' : 'Not receiving offers'}
          />
          <StatusChip
            ok={approved}
            label={approved ? 'Approved' : driver?.verificationStatus ?? 'No profile'}
            detail={approved ? 'You can take trips' : 'Fill documents, then go online'}
          />
          <StatusChip
            ok={connected}
            label={connected ? 'Live socket' : 'Socket down'}
            detail={connected ? 'Offers will pop here' : 'Reconnect or refresh'}
          />
          <StatusChip
            ok={gpsOk || online}
            label={gpsOk || online ? 'Location on' : 'Need GPS'}
            detail="Matching uses your pin, not the city name"
          />
          <StatusChip
            ok={canAccept}
            label={canAccept ? 'Can accept rides' : 'Not ready'}
            detail={canAccept ? 'Incoming requests appear below' : 'Go online, stay approved, keep GPS + socket live'}
          />
        </div>

        <p className="mt-4 max-w-lg text-sm text-ink/70">
          You drive a <strong className="capitalize">{driver?.vehicle.type ?? 'sedan'}</strong>
          {driver?.vehicle.plateNumber ? ` · ${driver.vehicle.plateNumber}` : ''}. Offers only match that vehicle.
          Rider and driver must both be in the same 8 km ring.
        </p>

        <button
          type="button"
          disabled={toggling || isFetching}
          className={`mt-8 min-h-14 w-full max-w-lg rounded-action px-6 py-5 text-left text-xl font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)] disabled:opacity-50 ${
            online ? 'bg-ink' : 'bg-milestone'
          }`}
          onClick={() => {
            void (online ? goOffline() : pingAndGoOnline()).catch(() => {
              setActionError(
                approved
                  ? 'Allow location, then tap again. Matching cannot find you without a GPS pin.'
                  : 'Complete onboarding (license + vehicle) first, then go online.',
              );
            });
          }}
        >
          {online ? 'Stop taking trips' : 'Start taking trips'}
        </button>
        {actionError ? <p className="mt-3 max-w-lg text-signal">{actionError}</p> : null}

        {offer && remainingMs > 0 ? (
          <article className="mt-8 max-w-2xl overflow-hidden rounded-card border border-milestone bg-surface">
            <RideMap
              pickup={stopToPoint(offer.pickup, 'Pickup')}
              drop={stopToPoint(offer.drop, 'Drop')}
              path={toMapPath(offer.path)}
              className="h-56 w-full"
            />
            <div className="p-5">
            <p className="font-display text-sm text-milestone">Incoming request</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{offer.rideCode}</h2>
            <p className="mt-3 text-sm">Pickup: {stopLabel(offer.pickup)}</p>
            <p className="text-sm">Drop: {stopLabel(offer.drop)}</p>
            <p className="mt-2 font-display text-2xl tabular">₹{Number(offer.fareTotal).toFixed(0)}</p>
            <p className="text-sm text-ink/60">{offer.distanceKm.toFixed(1)} km away · {Math.ceil(remainingMs / 1000)}s</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-kerb">
              <div className="h-full bg-milestone" style={{ width: `${Math.round(drain * 100)}%` }} />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                className="min-h-14 flex-1 rounded-action bg-milestone px-4 text-left font-medium text-white"
                onClick={() => {
                  void accept(offer.rideId)
                    .unwrap()
                    .then(() => navigate(`/rides/${offer.rideId}`));
                }}
              >
                Accept
              </button>
              <button
                type="button"
                className="min-h-14 flex-1 rounded-action border border-kerb px-4 text-left"
                onClick={() => {
                  void decline(offer.rideId).unwrap().finally(() => dismissOffer());
                }}
              >
                Decline
              </button>
            </div>
            </div>
          </article>
        ) : (
          <p className="mt-8 max-w-lg rounded-card border border-kerb bg-surface p-5 text-sm">
            {canAccept
              ? 'Waiting for a nearby rider. Keep this tab open — offers last 15 seconds.'
              : 'Go online with GPS on. Then ask a rider (same vehicle type, nearby) to confirm a trip.'}
          </p>
        )}

        {lastSync ? (
          <p className="mt-4">
            <Link className="text-milestone" to={`/rides/${lastSync.rideId}`}>
              Open active trip · {lastSync.status.replaceAll('_', ' ').toLowerCase()}
            </Link>
          </p>
        ) : null}

        <p className="mt-8 font-display text-3xl tabular">₹{(pay?.balance ?? 0).toFixed(2)}</p>
        <p className="text-sm text-ink/60">Ledger balance</p>

        <p className="mt-8 flex flex-col gap-2">
          <Link to="/driver">Documents</Link>
          <Link to="/earnings">Earnings</Link>
          <Link to="/">Home</Link>
        </p>
      </section>
    </main>
  );
}

function StatusChip({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={`rounded-card border p-3 ${ok ? 'border-milestone bg-milestone/10' : 'border-kerb bg-surface'}`}>
      <p className="font-display font-semibold">{label}</p>
      <p className="mt-1 text-sm text-ink/60">{detail}</p>
    </div>
  );
}
