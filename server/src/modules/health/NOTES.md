# Health

## What this module does

Exposes `GET /health` (process is alive) and `GET /ready` (Mongo and Redis both answer ping). Controllers only format the envelope; the service runs the probes.

## Why it's built this way

Load balancers need two different answers. `/health` must stay green during a brief Redis blip so the instance is not killed in a loop. `/ready` must go 503 if we cannot talk to data stores, so Render stops sending traffic. Probes are injected so tests do not need a real cluster.

## What breaks without it

You either kill healthy processes because Redis was slow for one second, or you keep routing rides to a server that cannot write a booking.

## Interview version

Liveness and readiness are separate on purpose: live means the process can answer HTTP; ready means the dependencies we need for real work are actually reachable.
