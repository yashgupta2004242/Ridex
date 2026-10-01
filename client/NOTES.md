# Client

## What this module does

Rider, driver, and admin UI: Vite + React 19, Redux Toolkit Query, React Router, Tailwind, MapLibre, Recharts. Milestone tokens (ink, paper, milestone, kerb, signal). Offline banner, error boundary, route spine on trip screens.

## Why it's built this way

Server state lives in RTK Query because that is the stack we already know. The route line is the progress indicator, status, and navigation — not a bottom sheet. `--signal` is reserved for surge, SOS, and errors. The driver home is a different product: 56px targets, one decision, a physical online switch.

## What breaks without it

The receipt would be a JSON blob. Interviewers would not see why the two apps look different.

## Interview version

Access token is RAM-only. Refresh is an httpOnly cookie. The map is clipped straight; the strip holds the spine and the primary action. Driver UI is for a red light. Rider UI can be denser. Same tokens, two jobs.
