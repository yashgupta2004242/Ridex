# RideX server (Phase 1)

## What this module does

The HTTP process: Express app factory, helmet / CORS allowlist / mongo-sanitize, then `server.ts` which loads env, connects Mongo and Redis, listens, and shuts down on SIGTERM.

## Why it's built this way

`createApp` is a function so tests can call it with fake readiness probes and never bind a port. `server.ts` is the only file that is allowed to `process.exit`. Security middleware is on from day one because adding helmet after auth is how people forget it.

## What breaks without it

No process, no tests that look like real HTTP, and a default Express stack that leaks `X-Powered-By` and accepts any browser origin.

## Interview version

The app is a pure function of config plus dependency probes; the process wrapper owns connections and shutdown. That split is what makes the health tests possible without Atlas.
