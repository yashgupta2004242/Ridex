import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { PlaceSearch, type Place } from '../../components/PlaceSearch';
import { RideMap } from '../../components/RideMap';
import type { RootState } from '../../app/store';
import {
  useCreateRideMutation,
  useEstimateRideMutation,
  useLazyReverseGeocodeQuery,
  useListPlacesQuery,
} from '../api';

export function EstimatePage() {
  const user = useSelector((state: RootState) => state.session.user);
  const [estimate, { data, isLoading, error }] = useEstimateRideMutation();
  const [createRide, { isLoading: booking, error: bookError }] = useCreateRideMutation();
  const [reverse] = useLazyReverseGeocodeQuery();
  const { data: saved } = useListPlacesQuery(undefined, { skip: !user });
  const navigate = useNavigate();
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [you, setYou] = useState<Place | null>(null);
  const [locateHint, setLocateHint] = useState('Allow location so we can pin you on the map.');

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocateHint('This browser cannot share GPS. Search a pickup instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        void reverse({ lat, lng })
          .unwrap()
          .then((result) => {
            setYou(result.place);
            setPickup((current) => current ?? result.place);
            setLocateHint('You are the blue-green pin. Change pickup if a friend is boarding.');
          })
          .catch(() => {
            const fallback = { label: 'Current location', lat, lng };
            setYou(fallback);
            setPickup((current) => current ?? fallback);
            setLocateHint('You are on the map. Search a drop to get fares.');
          });
      },
      () => setLocateHint('Location is off. Search pickup and drop by name — like Indore or IGI T3.'),
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  }, [reverse]);

  useEffect(() => {
    if (!pickup || !drop) return;
    void estimate({
      pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.label.slice(0, 180) },
      drop: { lat: drop.lat, lng: drop.lng, address: drop.label.slice(0, 180) },
    });
  }, [pickup, drop, estimate]);

  if (!user) return <Navigate to="/login" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pickup || !drop) return;
    await estimate({
      pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.label },
      drop: { lat: drop.lat, lng: drop.lng, address: drop.label },
    });
  }

  const failed =
    error && 'data' in error && error.data && typeof error.data === 'object' && 'error' in error.data
      ? String((error.data as { error?: { message?: string } }).error?.message)
      : error
        ? 'Could not price that route. Check both pins are on the map.'
        : null;

  const bookFailed =
    bookError && 'data' in bookError && bookError.data && typeof bookError.data === 'object' && 'error' in bookError.data
      ? String((bookError.data as { error?: { message?: string } }).error?.message)
      : bookError
        ? 'Could not book that vehicle. Sign in as a rider and try again.'
        : null;

  function book(vehicleType: 'bike' | 'auto' | 'sedan' | 'suv') {
    if (!pickup || !drop) return;
    void createRide({
      pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.label.slice(0, 180) },
      drop: { lat: drop.lat, lng: drop.lng, address: drop.label.slice(0, 180) },
      vehicleType,
      idempotencyKey: crypto.randomUUID(),
    })
      .unwrap()
      .then((result) => navigate(`/rides/${result.ride.id}`));
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="relative">
        <RideMap
          you={you ? { ...you, label: 'You' } : null}
          pickup={pickup ? { ...pickup, label: 'Pickup' } : null}
          drop={drop ? { ...drop, label: 'Drop' } : null}
          path={data?.path}
          className="h-[58vh] w-full border-b border-ink"
        />
        <ul className="pointer-events-none absolute left-3 top-3 space-y-1 text-xs font-medium">
          <li className="rounded-input bg-white/90 px-2 py-1 shadow-sm">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#3D8BFF]" />
            You / road route
          </li>
          <li className="rounded-input bg-white/90 px-2 py-1 shadow-sm">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-ink" />
            Pickup
          </li>
          <li className="rounded-input bg-white/90 px-2 py-1 shadow-sm">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-milestone" />
            Drop
          </li>
        </ul>
      </div>
      <section className="flex">
        <div className="w-1 bg-ink" aria-hidden="true" />
        <div className="flex-1 p-5 sm:p-6">
          <p className="font-display text-sm text-milestone">RideX</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Request a ride</h1>
          {user.role !== 'rider' ? (
            <p className="mt-2 max-w-lg text-signal">
              Booking is for rider accounts. This login is a {user.role}. Create a rider account to confirm a trip.
            </p>
          ) : null}
          <p className="mt-2 max-w-lg text-sm text-ink/70">{locateHint}</p>
          <form className="mt-5 max-w-md space-y-4" onSubmit={(event) => void onSubmit(event)}>
            <PlaceSearch
              id="pickup"
              title="Pickup"
              hint="Your pin, a saved place, or type a locality"
              value={pickup}
              onSelect={setPickup}
            />
            <PlaceSearch
              id="drop"
              title="Drop"
              hint="Search a city, landmark, or airport — it jumps on the map"
              value={drop}
              onSelect={setDrop}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-action border border-kerb px-4 py-2 text-sm"
                onClick={() => {
                  if (you) setPickup(you);
                }}
              >
                Use my location as pickup
              </button>
              {saved?.places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className="rounded-action border border-kerb px-4 py-2 text-sm"
                  onClick={() => setDrop({ label: place.label, lat: place.lat, lng: place.lng })}
                >
                  Drop: {place.label}
                </button>
              ))}
            </div>
            {failed ? <p className="text-signal">{failed}</p> : null}
            <button
              type="submit"
              disabled={isLoading || !pickup || !drop}
              className="w-full rounded-action bg-milestone px-6 py-4 text-left font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)] disabled:opacity-50"
            >
              {isLoading ? 'Checking the road…' : 'Get fares'}
            </button>
          </form>
          {data ? (
            <div className="mt-8 max-w-md">
              <h2 className="font-display text-xl font-semibold">Choose a vehicle</h2>
              <p className="mt-1 text-sm text-ink/60">Tap one card to send that ride to nearby drivers.</p>
              {bookFailed ? <p className="mt-2 text-signal">{bookFailed}</p> : null}
              <ul className="mt-4 space-y-3">
                {data.quotes.map((quote) => (
                  <li key={quote.vehicleType} className="rounded-card border border-kerb bg-surface p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-display text-lg capitalize">{quote.vehicleType}</p>
                      <p className="font-display text-2xl tabular">₹{quote.total.toFixed(2)}</p>
                    </div>
                    {quote.surgeMultiplier > 1 ? (
                      <p className="mt-1 text-sm text-signal">Surge {quote.surgeMultiplier}× on this cell</p>
                    ) : (
                      <p className="mt-1 text-sm text-ink/60">No surge</p>
                    )}
                    <button
                      type="button"
                      disabled={booking || !pickup || !drop || user.role !== 'rider'}
                      className="mt-4 w-full rounded-action bg-milestone px-6 py-3 text-left font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)] disabled:opacity-50"
                      onClick={() => book(quote.vehicleType)}
                    >
                      {booking ? 'Confirming…' : `Confirm ${quote.vehicleType}`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-6">
            <Link to="/">Back home</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
