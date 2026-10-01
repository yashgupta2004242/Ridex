import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { BrandMark } from '../../components/BrandMark';
import { ROAD_PHOTO } from '../../components/RoadArt';
import type { RootState } from '../../app/store';
import { useLogoutMutation } from '../api';
import { clearSession } from '../auth/sessionSlice';
import { useSocket } from '../realtime/useSocket';

export function HomePage() {
  const user = useSelector((state: RootState) => state.session.user);
  const [logout] = useLogoutMutation();
  const dispatch = useDispatch();
  const { connected, lastSync } = useSocket();

  async function onLogout() {
    await logout();
    dispatch(clearSession());
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-night text-white">
        <section className="relative min-h-[72vh] overflow-hidden">
          <img src={ROAD_PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-night via-night/75 to-night/20" />
          <div className="relative flex min-h-[72vh] flex-col justify-between px-6 py-8 sm:px-12">
            <BrandMark light />
            <div className="anim-rise max-w-xl pb-8">
              <p className="text-sm tracking-[0.2em] text-white/70">Milestone</p>
              <h1 className="mt-3 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                A marked road, not a floating map sheet.
              </h1>
              <p className="mt-4 max-w-md text-lg text-white/80">
                Book a sedan, watch the driver travel down a route line, pay cash or UPI. Built for Indian roads.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="rounded-action bg-milestone px-7 py-4 font-medium text-white shadow-[0_8px_20px_rgba(17,32,26,0.35)] transition hover:brightness-110"
                >
                  Create a rider account
                </Link>
                <Link
                  to="/login"
                  className="rounded-action border border-white/30 px-7 py-4 font-medium text-white transition hover:bg-white/10"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section className="grid gap-4 bg-paper px-6 py-10 text-ink sm:grid-cols-3 sm:px-12">
          {[
            { title: 'Live fare', copy: 'OSRM distance, surge from nearby demand, shown before you confirm.' },
            { title: 'One driver at a time', copy: 'We offer the nearest sedan for 15 seconds. No broadcast pile-on.' },
            { title: 'Driver app is different', copy: 'Bigger type, one decision, a switch you can hit at a red light.' },
          ].map((card) => (
            <article key={card.title} className="rounded-card border border-kerb bg-surface p-5">
              <h2 className="font-display text-xl font-semibold">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{card.copy}</p>
            </article>
          ))}
        </section>
      </main>
    );
  }

  const links = [
    { to: '/estimate', label: 'Request a ride', hint: 'Pin pickup and drop' },
    { to: '/history', label: 'Trip history', hint: 'Receipts and ratings' },
    { to: '/support', label: 'Support', hint: 'Ask the assistant' },
    { to: '/profile', label: 'Profile', hint: 'Name, phone, photo' },
  ];
  if (user.role === 'driver') {
    links.unshift({ to: '/drive', label: 'Driver home', hint: 'Go online' });
  }
  if (user.role === 'admin') {
    links.unshift({ to: '/admin/ops', label: 'Ops', hint: 'Live map and revenue' });
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="relative h-44 overflow-hidden">
        <img src={ROAD_PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-night/70" />
        <div className="relative flex h-full flex-col justify-end px-6 pb-6 text-white">
          <BrandMark light />
          <h1 className="mt-2 font-display text-3xl font-semibold">Hi {user.name.split(' ')[0]}</h1>
          <p className="text-sm text-white/75">
            {connected ? 'Live' : 'Offline'}
            {lastSync ? ` · trip ${lastSync.status.replaceAll('_', ' ').toLowerCase()}` : ''}
          </p>
        </div>
      </header>
      <section className="px-6 py-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {lastSync ? (
            <Link
              to={`/rides/${lastSync.rideId}`}
              className="rounded-card border border-milestone bg-milestone/10 p-5"
            >
              <p className="font-display text-xl font-semibold">Active trip</p>
              <p className="mt-1 text-sm text-ink/70">Open the route line and map</p>
            </Link>
          ) : null}
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-card border border-kerb bg-surface p-5 transition hover:border-milestone"
            >
              <p className="font-display text-xl font-semibold">{item.label}</p>
              <p className="mt-1 text-sm text-ink/60">{item.hint}</p>
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="mt-8 w-full max-w-sm rounded-action bg-ink px-6 py-4 text-left font-medium text-white"
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
