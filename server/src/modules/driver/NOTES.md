# Driver

## What this module does

Driver onboarding: license, vehicle, documents. `verificationStatus` is `pending → approved | rejected`. Going online is forbidden until approved. Changing plate or license after approval drops the driver back to pending.

## Why it's built this way

The matching engine (Phase 6) will GEOSEARCH Redis for `isOnline` drivers. If an unverified driver can flip that flag, riders get unmatched cars. Documents are URLs, not GridFS — we are not a file server. Going offline (or losing approval) removes the Redis geo member so matching cannot pick a parked car. Mongo `currentLocation` is a slower 30s flush from the socket throttle.

## What breaks without it

Admin has nothing to approve. Matching would either skip verification or query a collection that does not exist.

## Interview version

A driver app is a different product, and the data model says so: a `DriverProfile` is not a User with extra fields sprinkled on. Verification is a state machine with two legal exits from pending. Online is a privilege of the approved state, not a toggle.
