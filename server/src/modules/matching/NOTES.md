# Matching

## What this module does

Turns a `SEARCHING` ride into an assigned driver — or `NO_DRIVERS_FOUND`. It `GEOSEARCH`es 3 km, then 5, then 8; drops anyone offline, unverified, wrong vehicle, or already on a trip; ranks distance 60% / rating 25% / acceptance 15%; offers one driver at a time for 15 seconds; repeats for three rounds.

## Why it's built this way

Broadcasting to every car in 8 km makes the double-accept race the common path. Sequential offers make it rare, and the accept endpoint still treats it as possible. Geo comes from Redis (or MemoryGeo in tests), not Mongo `$near`, because the ping rate would melt the 2dsphere index. The offer broker is an in-memory waiter the HTTP accept/decline resolves — the worker does not poll Mongo for "did they tap".

## What breaks without it

Rides sit in SEARCHING forever, or every nearby driver gets the same card and two of them "win".

## Interview version

Expanding-radius geo query, a weighted score, sequential timeout, three rounds. Ranking is a pure function so I can unit-test that a closer 3-star beats a far 5-star.
