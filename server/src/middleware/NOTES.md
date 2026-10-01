# Middleware

## What this module does

Cross-cutting HTTP behavior: attach a request ID (honor `x-request-id` if the client sent one), run the rest of the request inside AsyncLocalStorage so Winston can read that ID, and convert thrown errors into the standard envelope.

Rate limiting lives here too: a Redis sliding window (Lua in production, MemoryCache in tests) — auth 5/min/IP, OTP 3/10min/phone, ride create 10/min/user. `requireAuth` reads the Bearer JWT; `requireSelfOrAdmin` is the ownership check. `Idempotency-Key` on `POST /rides` stores the JSON envelope in Redis for 24 h so a double tap replays instead of inserting a second ride.

## Why it's built this way

Request IDs belong on every log line and every JSON body. Putting them in AsyncLocalStorage means services do not take `req` as an argument — which is a hard project rule. The error handler is the last middleware and distinguishes `AppError` (safe to show) from unknown errors (generic 500, stack only in logs). `express-mongo-sanitize` is applied through our own wrapper because the package's `app.use(mongoSanitize())` types clash with Express's `RequestHandler`; we still call `mongoSanitize.sanitize()` on body, params, and query.

## What breaks without it

You cannot correlate a 500 in the browser with a line in Render logs. Unknown exceptions would either hang the request or leak internal messages to the client.

## Interview version

Every request gets an ID, logs pick it up without threading `req` through services, and one error middleware is the only place that writes failure JSON.
