import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../app/store';
import { RideMap } from '../../components/RideMap';
import { toMapPath } from '../../components/geoStops';
import { useListRidesQuery } from '../api';

export function HistoryPage() {
  const user = useSelector((state: RootState) => state.session.user);
  const { data } = useListRidesQuery(undefined, { skip: !user });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!user) return <Navigate to="/login" replace />;
  const rides = data?.rides ?? [];
  const selected = rides.find((ride) => ride.id === selectedId) ?? rides[0];

  return (
    <main className="min-h-screen bg-paper">
      {selected ? (
        <RideMap
          pickup={{ ...selected.pickup, label: selected.pickup.address || 'Pickup' }}
          drop={{ ...selected.drop, label: selected.drop.address || 'Drop' }}
          path={toMapPath(selected.path)}
          trail={toMapPath(selected.route)}
          className="h-[42vh] w-full border-b border-ink"
        />
      ) : (
        <div className="h-24 bg-kerb" />
      )}
      <section className="p-6">
        <p className="font-display text-sm text-milestone">History</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Your trips</h1>
        {selected ? (
          <p className="mt-2 max-w-lg text-sm text-ink/70">
            {selected.pickup.address || 'Pickup'} → {selected.drop.address || 'Drop'} · blue line follows roads
          </p>
        ) : null}
        {!rides.length ? (
          <p className="mt-6 max-w-md">No trips yet. Get a fare on the estimate screen, then confirm a vehicle.</p>
        ) : (
          <ul className="mt-6 max-w-lg space-y-3">
            {rides.map((ride) => (
              <li key={ride.id}>
                <div
                  className={`w-full rounded-card border p-4 ${
                    selected?.id === ride.id ? 'border-milestone bg-milestone/10' : 'border-kerb bg-surface'
                  }`}
                >
                  <button type="button" className="w-full text-left" onClick={() => setSelectedId(ride.id)}>
                    <p className="font-display">{ride.rideCode}</p>
                    <p className="text-sm">
                      {ride.summary || ride.status.toLowerCase()} · ₹{ride.fare.total.toFixed(2)}
                    </p>
                  </button>
                  <Link className="mt-2 inline-block text-sm text-milestone" to={`/rides/${ride.id}`}>
                    Open trip
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-8">
          <Link to="/">Home</Link>
        </p>
      </section>
    </main>
  );
}
