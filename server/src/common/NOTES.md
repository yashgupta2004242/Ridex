# Common

## What this module does

Shared primitives used by every feature: `AppError`, the `{ success, data, error, requestId }` envelope, `asyncHandler`, request AsyncLocalStorage, HTTP constants, and graceful shutdown.

## Why it's built this way

Controllers should not invent their own error shapes. One `AppError` plus one global handler means the client always sees the same JSON. `asyncHandler` is a three-line wrapper so we do not forget `catch` on every route. Shutdown closes Socket.IO (which also closes HTTP), then Redis, then Mongo, in that order, and ignores a second SIGTERM so we do not double-close.

## What breaks without it

Scattered `res.status(500).send('oops')` responses, unhandled promise rejections crashing Node, and Render sending SIGTERM while mongoose still has open sockets — which shows up as connection leaks on the next boot.

## Interview version

A tiny shared kernel: typed errors, a stable API envelope, async route wrapping, and an ordered shutdown. Nothing domain-specific lives here on purpose.
