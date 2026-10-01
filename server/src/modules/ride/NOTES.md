# Ride

## What this module does

Owns the ride document and the state machine. `POST /rides` is idempotent. Matching offers drivers while status is `SEARCHING`. Accept is a Redis lock plus a conditional Mongo update so two taps cannot assign two drivers. The rider's 4-digit OTP is hashed; only the rider's GET sees the plaintext (Redis, 30 minutes). Completion keeps the quoted fare (surge snapshot) and enqueues a receipt job. Rating is a separate document.

## Why it's built this way

Controllers never write `status`. The state machine is a table: illegal edges throw `INVALID_TRANSITION`. The double-accept path does not go through that table's in-memory `apply` first — `findOneAndUpdate({ status: SEARCHING, driverId: null })` is the source of truth, then we walk `DRIVER_ASSIGNED → DRIVER_ARRIVING`. Cancellation is free before assignment; after two minutes with a driver it charges ₹30. Driver cancels cut acceptance rate.

## What breaks without it

You get two cars on one pin, or a trip that starts without the OTP, or a double-tap that bills two estimates.

## Interview version

Matching is sequential 15-second offers, not a broadcast. Accept is two locks: Redis `SET NX PX` so we serialize, and a conditional Mongo update so even if the lock layer is wrong, the second writer still loses with 409. I ran that race 100 times in Jest.
