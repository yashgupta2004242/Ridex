import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../app/store';
import { usePendingDriversQuery, useVerifyDriverMutation } from '../api';

export function AdminQueuePage() {
  const user = useSelector((state: RootState) => state.session.user);
  const { data, refetch } = usePendingDriversQuery(undefined, { skip: user?.role !== 'admin' });
  const [verify] = useVerifyDriverMutation();

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;

  const drivers = data?.drivers ?? [];

  return (
    <main className="flex min-h-screen bg-paper">
      <div className="w-1 bg-ink" aria-hidden="true" />
      <section className="flex-1 p-6">
        <p className="font-display text-sm text-milestone">Admin</p>
        <h1 className="mt-4 font-display text-3xl font-semibold">Driver verification</h1>
        {drivers.length === 0 ? (
          <p className="mt-6">No drivers waiting. Check back after a new signup completes onboarding.</p>
        ) : (
          <ul className="mt-6 max-w-xl space-y-4">
            {drivers.map((driver) => (
              <li key={driver.userId} className="rounded-card border border-kerb bg-surface p-4">
                <p className="font-display text-lg">{driver.vehicle.plateNumber || 'No plate yet'}</p>
                <p className="text-sm">
                  {driver.vehicle.model} · {driver.licenseNumber}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="min-h-14 rounded-action bg-milestone px-5 text-white"
                    onClick={() =>
                      void verify({ userId: driver.userId, decision: 'approved' }).then(() => refetch())
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="min-h-14 rounded-action border border-signal px-5 text-signal"
                    onClick={() =>
                      void verify({
                        userId: driver.userId,
                        decision: 'rejected',
                        reason: 'Documents unclear',
                      }).then(() => refetch())
                    }
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
