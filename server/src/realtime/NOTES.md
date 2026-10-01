# Realtime

## What this module does

Attaches Socket.IO to the HTTP server after Mongo and Redis are up. Handshake auth is the same 15-minute access JWT as REST. Each socket joins `user:{id}`. If `RideSyncPort` later returns an active ride, the socket also joins `ride:{id}` and the client is sent `ride:sync`. Driver pings on `driver:location` are throttled to 4 seconds, written to a geo index (`GEOADD` when Redis is connected), and flushed to Mongo every 30 seconds.

## Why it's built this way

Riders cannot poll `/rides/:id` every second — that would stampede Mongo. Rooms mean one emit fans out to whoever is watching that trip. Redis adapter is optional: a single Render instance uses the in-memory adapter; two instances share pub/sub. Geo lives in Redis because matching (Phase 6) will `GEOSEARCH` by radius, which a 2dsphere Mongo query is too slow for at ping rate. Mongo still gets a slower write so a crash does not forget the last known point.

Throttle is a Map of timestamps, not a Redis key, because a missed ping is harmless and we must not round-trip Redis 15 times a minute per driver just to say "too soon".

`RideSyncPort` is a stub that returns `null` until the Ride module exists. Matching will inject a real implementation without changing the socket handshake.

## What breaks without it

The map pin would jump, reconnect would show a blank trip, and two API processes would emit to different memory rooms so the rider never sees `ride:accepted`.

## Interview version

Auth on the handshake, not a later event, so an unauthenticated client never occupies a room. Access JWT is short-lived on purpose: when it expires the client reconnects with a refreshed token. Location is two clocks: 4s for the live map, 30s for durable Mongo. Redis GEO is the matching index; Mongo is the audit trail.
