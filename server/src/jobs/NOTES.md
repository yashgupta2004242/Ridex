# Jobs

## What this module does

Queue ports for matching, receipts, and trip summaries. Development uses `InlineJobQueue`. Production with Redis uses BullMQ; `node dist/jobs/worker.js` is the Render worker. Receipt jobs write a one-line `Ride.summary`. Failed matching jobs after three attempts go to `ridex-matching-dlq`.

## Why it's built this way

A 15-second offer loop must not sit inside `POST /rides`. BullMQ needs an ioredis connection with `maxRetriesPerRequest: null`, so the worker does not reuse the API Redis client. Tests pass `NoopJobQueue` and call `matching.run` themselves so Jest is not waiting on wall-clock timeouts.

## What breaks without it

The HTTP request would hold a load-balancer connection for the whole hunt, or a crash during round two would forget the ride.

## Interview version

Slow work is a job with retries and a dead-letter queue. The API returns SEARCHING immediately. A second process is the correct production shape; inlining locally is only so a student can demo on one laptop.
