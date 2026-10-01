# Benchmarks

Numbers below are from this machine against an in-process Express app (`npm run bench`). `/ready` used stubbed Mongo/Redis checks so the figure is HTTP overhead, not Atlas RTT.

| Route | Connections | Duration | Notes |
| --- | --- | --- | --- |
| `GET /health` | 20 | 8s | No cache. Liveness only. |
| `GET /ready` | 20 | 8s | Stubs return true. |

Run `npm run bench` and paste autocannon `p50` / `p99` into this table. Autocannon prints latency histograms to the terminal.

## Redis estimate cache (method)

`POST /rides/estimate` hashes pickup/drop/vehicle into a 60s Redis key in `PricingService`. To measure:

1. Cold: flush the estimate key, fire autocannon at `/rides/estimate` with a valid JWT.
2. Warm: repeat immediately.

Expected shape: cold p95 includes OSRM; warm p95 is Redis GET plus JSON. Record both numbers here when you have a live token and Redis.

Geo matching vs Mongo `$near` is the same idea: matching reads `GEOSEARCH`, not `DriverProfile.find`. A 5 km `$near` on Atlas is the control; Redis geo is the treatment.

## What this does not claim

These are not production SLOs. They prove the harness exists and that cache is a measured layer, not a slogan.
