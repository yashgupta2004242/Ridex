import { Link, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { RootState } from '../../app/store';
import { useAdminStatsQuery, useLiveRidesQuery, usePendingDriversQuery } from '../api';

export function AdminOpsPage() {
  const user = useSelector((state: RootState) => state.session.user);
  const { data: stats } = useAdminStatsQuery(undefined, { skip: user?.role !== 'admin' });
  const { data: live } = useLiveRidesQuery(undefined, { skip: user?.role !== 'admin', pollingInterval: 5000 });
  const { data: pending } = usePendingDriversQuery(undefined, { skip: user?.role !== 'admin' });
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  const chart = [{ name: 'Captured', value: stats?.revenue ?? 0 }];
  return (
    <main className="flex min-h-screen bg-paper">
      <div className="w-1 bg-ink" />
      <section className="flex-1 p-6">
        <h1 className="font-display text-3xl font-semibold">Ops</h1>
        <p className="mt-2">Queue health: {pending?.drivers.length ?? 0} drivers waiting. {live?.rides.length ?? 0} live trips.</p>
        <div className="mt-6 h-48 max-w-lg">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <XAxis dataKey="name" />
              <YAxis />
              <Bar dataKey="value" fill="#1F6F4A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-6 max-w-lg space-y-2">
          {live?.rides.map((ride) => (
            <li key={ride.id}>
              {ride.rideCode} · {ride.status}
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link to="/admin">Verification queue</Link>
        </p>
      </section>
    </main>
  );
}
