import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { BrandMark } from '../../components/BrandMark';
import { RideMap } from '../../components/RideMap';
import { ROAD_PHOTO } from '../../components/RoadArt';
import { toMapPath } from '../../components/geoStops';
import type { RootState } from '../../app/store';
import { useEarningsQuery, useGetDriverMeQuery } from '../api';

const TYPE_LABEL: Record<string, string> = {
  earning: 'Trip earning',
  payout: 'Weekly payout',
  refund_clawback: 'Refund clawback',
};

export function EarningsPage() {
  const user = useSelector((state: RootState) => state.session.user);
  const { data } = useEarningsQuery(undefined, { skip: user?.role !== 'driver' });
  const { data: profile } = useGetDriverMeQuery(undefined, { skip: user?.role !== 'driver' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'driver') return <Navigate to="/" replace />;

  const driver = profile?.driver;
  const balance = data?.balance ?? 0;
  const today = data?.today ?? 0;
  const month = data?.month ?? 0;
  const paidTrips = data?.paidTrips ?? 0;
  const trips = driver?.totalTrips ?? paidTrips;
  const rating = driver?.rating ?? 0;
  const acceptance = Math.round((driver?.acceptanceRate ?? 0) * 100);
  const entries = data?.entries ?? [];
  const reviews = data?.reviews ?? [];
  const tripRoutes = data?.trips ?? [];
  const selected =
    tripRoutes.find((row) => row.rideId === selectedId) ?? tripRoutes[0] ?? null;

  return (
    <main className="min-h-screen bg-paper">
      <header className="relative h-40 overflow-hidden">
        <img src={ROAD_PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-night/70" />
        <div className="relative flex h-full flex-col justify-end px-6 pb-5 text-white">
          <BrandMark light />
          <h1 className="mt-1 font-display text-3xl font-semibold">Earnings</h1>
          <p className="mt-1 text-sm text-white/80">Ledger, trips, and what riders said about you</p>
        </div>
      </header>

      <section className="px-6 py-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Ledger balance" value={`₹${balance.toFixed(2)}`} detail="Net of payouts and clawbacks" accent />
          <MetricCard label="Today" value={`₹${today.toFixed(2)}`} detail="Trip earnings since midnight IST" />
          <MetricCard label="This month" value={`₹${month.toFixed(2)}`} detail="Trip earnings this calendar month" />
          <MetricCard label="Completed trips" value={String(trips)} detail={`${paidTrips} paid ledger rows`} />
          <MetricCard label="Driver rating" value={rating.toFixed(1)} detail={`${stars(rating)} out of 5`} />
          <MetricCard label="Acceptance" value={`${acceptance}%`} detail="Offers you took vs sent" />
        </div>

        <article className="mt-8 overflow-hidden rounded-card border border-kerb bg-surface">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="font-display text-xl font-semibold">Trip routes</h2>
              <p className="mt-1 text-sm text-ink/60">
                {selected
                  ? `${selected.rideCode} · ${selected.pickup.address || 'Pickup'} → ${selected.drop.address || 'Drop'}`
                  : 'Completed trips show the road path here'}
              </p>
            </div>
            {selected ? (
              <Link className="text-milestone" to={`/rides/${selected.rideId}`}>
                Open trip
              </Link>
            ) : null}
          </div>
          {selected ? (
            <RideMap
              pickup={{ ...selected.pickup, label: selected.pickup.address || 'Pickup' }}
              drop={{ ...selected.drop, label: selected.drop.address || 'Drop' }}
              path={toMapPath(selected.path)}
              className="mt-4 h-[28rem] w-full border-y border-kerb"
            />
          ) : (
            <p className="px-5 py-10 text-sm text-ink/60">No completed trips with a path yet.</p>
          )}
          {tripRoutes.length > 1 ? (
            <ul className="flex gap-2 overflow-x-auto px-5 py-4">
              {tripRoutes.map((row) => (
                <li key={row.rideId}>
                  <button
                    type="button"
                    className={`rounded-action border px-4 py-2 text-sm ${
                      selected?.rideId === row.rideId
                        ? 'border-milestone bg-milestone text-white'
                        : 'border-kerb bg-paper'
                    }`}
                    onClick={() => setSelectedId(row.rideId)}
                  >
                    {row.rideCode}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <article className="rounded-card border border-kerb bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Rider comments</h2>
            {reviews.length === 0 ? (
              <p className="mt-4 text-sm text-ink/60">No ratings yet. Comments show up after a rider rates a completed trip.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {reviews.map((row) => (
                  <li key={row.id} className="border-b border-kerb pb-4 last:border-0 last:pb-0">
                    <p className="font-display text-lg">
                      {stars(row.score)} <span className="text-sm text-ink/60">{row.score}/5</span>
                    </p>
                    <p className="mt-1">{row.comment || 'No written comment'}</p>
                    <p className="mt-1 text-sm text-ink/50">
                      {row.rideCode ? `${row.rideCode} · ` : ''}
                      {formatWhen(row.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-card border border-kerb bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Ledger</h2>
            {entries.length === 0 ? (
              <p className="mt-4 text-sm text-ink/60">No credits yet. Completed, paid trips land here.</p>
            ) : (
              <ul className="mt-4 space-y-1">
                {entries.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-4 border-b border-kerb py-3">
                    <div>
                      <p className="font-medium">{TYPE_LABEL[row.type] ?? row.type}</p>
                      <p className="text-sm text-ink/55">{row.note || formatWhen(row.at)}</p>
                      <p className="text-sm text-ink/45">{formatWhen(row.at)}</p>
                    </div>
                    <p className={`font-display text-xl tabular ${row.amount < 0 ? 'text-signal' : 'text-milestone'}`}>
                      {row.amount < 0 ? '−' : '+'}₹{Math.abs(row.amount).toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>

        <p className="mt-8 flex flex-col gap-2">
          <Link to="/drive">Driver home</Link>
          <Link to="/driver">Documents</Link>
          <Link to="/">Home</Link>
        </p>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-card border p-4 ${accent ? 'border-milestone bg-milestone/10' : 'border-kerb bg-surface'}`}>
      <p className="text-sm text-ink/60">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular">{value}</p>
      <p className="mt-2 text-sm text-ink/55">{detail}</p>
    </div>
  );
}

function stars(score: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
