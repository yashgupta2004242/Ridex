# Pricing

## What this module does

Turns a pickup and drop into a rupee quote for every vehicle type. Distance and duration come from OSRM. The rupee math is a pure function. Surge is demand/supply in a geohash cell over a 5-minute window, capped at 2.5×. The slow OSRM answer is cached for 60 seconds; surge is recomputed on every estimate so the badge can move.

## Why it's built this way

OSRM is a public HTTP API — if every keystroke on the map hits it, we get rate-limited and the estimate spinner lies. Caching the *route*, not the *price*, means two riders in the same corridor share the metres but still see live surge. Geohash precision 6 is about a kilometre: small enough that a stadium concert surges, large enough that one lonely ping does not. Money is rounded per line so the receipt adds up.

## What breaks without it

Matching would invent a fare at trip end. Surge would be a hardcoded 1.5 that you cannot defend. Hitting OSRM on every estimate would flake in the demo.

## Interview version

The fare is `base + km + minutes`, surge multiplies that subtotal, then platform fee and GST. Surge is `min(2.5, max(1, demand/supply))` in a geohash cell. The functions have no I/O, so they are unit-tested at 100%. The service is just: cache the map, count the cell, call the pure function.
