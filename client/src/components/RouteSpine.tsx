import type { ReactNode } from 'react';

const STAGES = ['SEARCHING', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

export function RouteSpine({ status, children }: { status: string; children: ReactNode }) {
  const active = Math.max(0, STAGES.findIndex((step) => status.startsWith(step.slice(0, 6)) || status === step));
  const index = STAGES.includes(status) ? STAGES.indexOf(status) : active;
  return (
    <div className="flex min-h-full">
      <ol className="flex w-6 flex-col items-center py-6" aria-label="Trip progress">
        {STAGES.map((step, i) => (
          <li key={step} className="flex flex-1 flex-col items-center">
            <span
              className={`h-3 w-3 rounded-full ${i <= index ? 'bg-milestone' : 'bg-kerb'}`}
              title={step.toLowerCase()}
            />
            {i < STAGES.length - 1 ? (
              <span className={`w-px flex-1 ${i < index ? 'bg-milestone' : 'bg-kerb'}`} />
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex-1">{children}</div>
    </div>
  );
}
