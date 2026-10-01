# Rating

## What this module does

Stores one 1–5 score and an optional comment per completed ride. The rider submits it after `COMPLETED`. Matching does not read comments; acceptance rate is offer-based, not star-based.

## Why it's built this way

A rating is not a field on Ride that you overwrite. It is its own document with a unique `rideId` so a double-tap cannot create two reviews. Phase 8 can aggregate comments later without migrating the ride collection.

## What breaks without it

Completion would have nowhere to put the rider's opinion, and the admin "driver quality" story would be invented in Phase 8.

## Interview version

One ride, one rating document. Unique index is the idempotency. Stars are for humans; matching uses distance, rating average, and acceptance rate from the driver profile.
