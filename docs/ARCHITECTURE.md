# Architecture

RideX is one Express process plus an optional BullMQ worker. MongoDB holds durable documents. Redis holds sessions of short-lived truth: refresh-family denylist, geo, locks, rate limits, estimate cache, Socket.IO adapter.

```mermaid
flowchart TB
  client[React + RTK Query]
  api[Express layered modules]
  worker[worker.js]
  mongo[(MongoDB)]
  redis[(Redis)]
  client -->|REST + Socket.IO| api
  api --> mongo
  api --> redis
  worker --> mongo
  worker --> redis
```

## Ride sequence

```mermaid
sequenceDiagram
  participant Rider
  participant API
  participant Redis
  participant Worker
  participant Driver
  Rider->>API: POST /rides (Idempotency-Key)
  API->>Redis: cache replay + enqueue
  API-->>Rider: SEARCHING
  Worker->>Redis: GEOSEARCH rings
  Worker->>Driver: ride:offer 15s
  Driver->>API: POST /rides/:id/accept
  API->>Redis: SET NX lock
  API->>API: Mongo findOneAndUpdate SEARCHING
```

## Matching

GEOSEARCH 3 km, then 5, then 8. Filter online, verified, idle, vehicle type. Rank 60% distance, 25% rating, 15% acceptance. Sequential offers, three rounds, then `NO_DRIVERS_FOUND`.

## State machine

```mermaid
stateDiagram-v2
  [*] --> REQUESTED
  REQUESTED --> SEARCHING
  SEARCHING --> DRIVER_ASSIGNED
  SEARCHING --> NO_DRIVERS_FOUND
  DRIVER_ASSIGNED --> DRIVER_ARRIVING
  DRIVER_ARRIVING --> DRIVER_ARRIVED
  DRIVER_ARRIVED --> IN_PROGRESS: OTP
  IN_PROGRESS --> COMPLETED
  SEARCHING --> CANCELLED_BY_RIDER
  DRIVER_ARRIVING --> CANCELLED_BY_RIDER
```

## Payments

Cash captures in-process. UPI/card create a Razorpay order. Webhooks are idempotent on `event.id`. Driver money is an append-only ledger; balance is `SUM(amount)`.

## AI

`LlmPort` never receives a Mongoose handle. Tools call `RideService` / `PaymentService` with the logged-in user id. OpenAI is optional; `FallbackLlm` keeps the app up after an 8s timeout.
