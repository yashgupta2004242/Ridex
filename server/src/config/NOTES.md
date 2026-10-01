# Config

## What this module does

Owns boot-time wiring: validating environment variables, connecting to MongoDB and Redis with retries, and creating the Winston logger that every other file uses.

## Why it's built this way

Secrets never live in source. Zod parses `process.env` once; if a required value is missing we throw before `listen()` so a misconfigured Render service fails immediately instead of serving traffic half-broken. Mongo and Redis retry with backoff because Atlas and Upstash can flap for a few seconds on boot. The logger redacts passwords, tokens, and OTPs so a debug log cannot leak credentials.

## What breaks without it

Without env validation the process starts and then fails on the first request with a confusing driver error. Without retry, a single DNS blip during deploy takes the whole API down. Without redaction, `/health` is fine but a login error log would print the user's password.

## Interview version

We fail fast on invalid config, treat Mongo and Redis as dependencies that may need a few reconnect attempts, and push a request ID plus redaction into every log line so incidents are traceable without leaking secrets.
