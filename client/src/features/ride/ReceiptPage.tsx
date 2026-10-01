import { Link, Navigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../app/store';
import { useGetRideQuery } from '../api';

export function ReceiptPage() {
  const { id } = useParams();
  const user = useSelector((state: RootState) => state.session.user);
  const { data } = useGetRideQuery(id ?? '', { skip: !id });
  if (!user) return <Navigate to="/login" replace />;
  const ride = data?.ride;
  return (
    <main className="flex min-h-screen justify-center bg-paper p-6">
      <article className="relative w-full max-w-sm border border-kerb bg-surface p-6">
        <div className="absolute left-1/2 top-0 h-4 w-16 -translate-x-1/2 -translate-y-1/2 rotate-180 bg-paper [clip-path:polygon(50%_100%,0_0,100%_0)]" />
        <div className="flex gap-4">
          <div className="w-px bg-ink" />
          <div>
            <p className="font-display text-sm text-milestone">RideX stone</p>
            <h1 className="mt-4 font-display text-5xl tabular">₹{ride?.fare.total.toFixed(2) ?? '—'}</h1>
            <p className="mt-6">{ride?.pickup.address || 'Pickup'}</p>
            <p className="mt-2">{ride?.drop.address || 'Drop'}</p>
            <p className="mt-6 text-sm">{ride?.rideCode}</p>
          </div>
        </div>
        <p className="mt-10">
          <Link to="/history">Trip list</Link>
        </p>
      </article>
    </main>
  );
}
