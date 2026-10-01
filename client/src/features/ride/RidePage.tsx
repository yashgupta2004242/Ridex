import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../app/store';
import { RideMap } from '../../components/RideMap';
import { toMapPath } from '../../components/geoStops';
import { RouteSpine } from '../../components/RouteSpine';
import {
  useAcceptRideMutation,
  useArriveRideMutation,
  useCancelRideMutation,
  useCompleteRideMutation,
  useDeclineRideMutation,
  useGetRideQuery,
  usePayRideMutation,
  useRateRideMutation,
  useSosMutation,
  useStartRideMutation,
} from '../api';
import { useSocket } from '../realtime/useSocket';

export function RidePage() {
  const { id } = useParams();
  const user = useSelector((state: RootState) => state.session.user);
  const { data, isError } = useGetRideQuery(id ?? '', { skip: !id, pollingInterval: 2000 });
  const [accept] = useAcceptRideMutation();
  const [decline] = useDeclineRideMutation();
  const [arrive] = useArriveRideMutation();
  const [start] = useStartRideMutation();
  const [complete] = useCompleteRideMutation();
  const [cancel] = useCancelRideMutation();
  const [pay] = usePayRideMutation();
  const [rate] = useRateRideMutation();
  const [sos] = useSosMutation();
  const [otp, setOtp] = useState('');
  const [score, setScore] = useState('5');
  const { driverPing } = useSocket();

  if (!user) return <Navigate to="/login" replace />;
  if (!id) return <Navigate to="/estimate" replace />;
  const ride = data?.ride;

  return (
    <main className="min-h-screen bg-paper">
      {ride ? (
        <div className="relative">
          <RideMap
            pickup={{ ...ride.pickup, label: ride.pickup.address || 'Pickup' }}
            drop={{ ...ride.drop, label: ride.drop.address || 'Drop' }}
            path={toMapPath(ride.path)}
            trail={toMapPath(ride.route)}
            driver={
              driverPing && ride.driverId && driverPing.driverId === ride.driverId
                ? { ...driverPing, label: 'Driver' }
                : ride.route && ride.route.length > 0
                  ? { ...ride.route[ride.route.length - 1]!, label: 'Driver' }
                  : null
            }
            followDriver={ride.status === 'IN_PROGRESS' || ride.status === 'DRIVER_ARRIVING'}
          />
          <ul className="pointer-events-none absolute left-3 top-3 space-y-1 text-xs font-medium">
            <li className="rounded-input bg-white/90 px-2 py-1 shadow-sm">
              <span className="mr-1 inline-block h-2 w-4 rounded-sm bg-[#3D8BFF]" />
              Planned route (roads)
            </li>
            <li className="rounded-input bg-white/90 px-2 py-1 shadow-sm">
              <span className="mr-1 inline-block h-2 w-4 rounded-sm bg-signal" />
              Driven path
            </li>
          </ul>
        </div>
      ) : (
        <div className="h-[56vh] animate-pulse bg-kerb" />
      )}
      <RouteSpine status={ride?.status ?? 'SEARCHING'}>
        <section className="p-6">
          <p className="font-display text-sm text-milestone">Trip</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{ride?.rideCode ?? 'Finding a driver'}</h1>
          {isError ? <p className="mt-4 text-signal">Could not load this ride.</p> : null}
          {ride ? (
            <>
              <p className="mt-2">{ride.status.replaceAll('_', ' ').toLowerCase()}</p>
              <p className="mt-1 font-display text-2xl tabular">₹{ride.fare.total.toFixed(2)}</p>
              {ride.otp ? <p className="mt-4 font-display text-4xl tabular">OTP {ride.otp}</p> : null}
              <div className="mt-8 flex max-w-sm flex-col gap-3">
                {user.role === 'driver' && ride.status === 'SEARCHING' ? (
                  <>
                    <button
                      type="button"
                      className="min-h-14 rounded-action bg-milestone px-6 py-4 text-left text-lg font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
                      onClick={() => void accept(ride.id)}
                    >
                      Accept this ride
                    </button>
                    <button type="button" className="min-h-14" onClick={() => void decline(ride.id)}>
                      Decline
                    </button>
                  </>
                ) : null}
                {user.role === 'driver' && ride.status === 'DRIVER_ARRIVING' ? (
                  <button
                    type="button"
                    className="min-h-14 rounded-action bg-milestone px-6 py-4 text-left text-lg font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
                    onClick={() => void arrive(ride.id)}
                  >
                    I have arrived
                  </button>
                ) : null}
                {user.role === 'driver' && ride.status === 'DRIVER_ARRIVED' ? (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void start({ id: ride.id, otp });
                    }}
                  >
                    <input
                      className="min-h-14 w-full rounded-input border border-kerb px-3 py-2 text-lg tabular"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      placeholder="4-digit OTP"
                      maxLength={4}
                    />
                    <button
                      type="submit"
                      className="min-h-14 w-full rounded-action bg-milestone px-6 py-4 text-left text-lg font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
                    >
                      Start trip
                    </button>
                  </form>
                ) : null}
                {user.role === 'driver' && ride.status === 'IN_PROGRESS' ? (
                  <button
                    type="button"
                    className="min-h-14 rounded-action bg-milestone px-6 py-4 text-left text-lg font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
                    onClick={() => void complete(ride.id)}
                  >
                    Complete trip
                  </button>
                ) : null}
                {user.role === 'rider' && ride.status === 'COMPLETED' ? (
                  <>
                    <button
                      type="button"
                      className="min-h-14 rounded-action bg-milestone px-6 py-4 text-left font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.18)]"
                      onClick={() =>
                        void pay({ rideId: ride.id, method: 'cash', idempotencyKey: crypto.randomUUID() })
                      }
                    >
                      Pay cash
                    </button>
                    <Link to={`/rides/${ride.id}/receipt`}>Open receipt</Link>
                    <form
                      className="space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void rate({ id: ride.id, score: Number(score), comment: 'Smooth trip' });
                      }}
                    >
                      <input
                        className="w-full rounded-input border border-kerb px-3 py-2 tabular"
                        value={score}
                        onChange={(event) => setScore(event.target.value)}
                        min={1}
                        max={5}
                        type="number"
                      />
                      <button type="submit" className="text-milestone">
                        Rate this trip
                      </button>
                    </form>
                  </>
                ) : null}
                {ride.status === 'IN_PROGRESS' || ride.status === 'DRIVER_ARRIVING' ? (
                  <button
                    type="button"
                    className="text-signal"
                    onClick={() => void sos({ rideId: ride.id, message: 'SOS from the trip screen' })}
                  >
                    Send SOS
                  </button>
                ) : null}
                {ride.status !== 'COMPLETED' &&
                !ride.status.startsWith('CANCELLED') &&
                ride.status !== 'NO_DRIVERS_FOUND' ? (
                  <button
                    type="button"
                    className="text-signal"
                    onClick={() => void cancel({ id: ride.id, reason: 'Changed my plans' })}
                  >
                    Cancel ride
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-4 max-w-sm">We are offering nearby drivers one at a time. This is the only animated wait in the product.</p>
          )}
          <p className="mt-8">
            <Link to="/">Back home</Link>
          </p>
        </section>
      </RouteSpine>
    </main>
  );
}
