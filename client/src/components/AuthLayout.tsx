import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import { ROAD_PHOTO, RoadArt } from './RoadArt';

export function AuthLayout({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[minmax(280px,0.95fr)_1.1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src={ROAD_PHOTO}
          alt="A car on a rain-slick highway at night"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-night/20" />
        <RoadArt className="absolute bottom-0 right-0 h-[70%] w-auto opacity-80 mix-blend-screen" />
        <div className="relative flex h-full flex-col justify-between p-8 text-white">
          <BrandMark light />
          <div className="anim-rise max-w-sm">
            <p className="font-display text-4xl font-semibold leading-tight tracking-tight">A marked road.</p>
            <p className="mt-3 text-base text-white/80">
              Pickup, driver, drop — three stones on one line. Not another floating map sheet.
            </p>
          </div>
        </div>
      </aside>
      <section className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="w-1 absolute inset-y-0 left-0 bg-ink lg:hidden" aria-hidden="true" />
        <div className="anim-rise mx-auto w-full max-w-md flex-1">
          <BrandMark />
          <p className="mt-8 text-sm text-milestone">{kicker}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
