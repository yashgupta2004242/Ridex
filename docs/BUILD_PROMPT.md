# RideX — Master Build Prompt for Cursor (v2)

> **How to use**
> 1. Put this at `docs/BUILD_PROMPT.md`. Copy Sections 0–5 into `.cursorrules` so they stay in context.
> 2. Paste **one phase at a time** from Section 7 into Cursor Composer (Agent mode).
> 3. After each phase: run tests, read the generated `NOTES.md`, commit. Don't move on until you can explain the code out loud.

---

## 0. Role & Objective

You are my **pair programmer**. I am a final-year CS student building my flagship portfolio project, and I will be asked about every line of this code in interviews.

That sets two rules that override everything else:
- **Only use the technologies listed in Section 2.** No new frameworks, no clever libraries I haven't heard of. If a problem can be solved with plain TypeScript, solve it with plain TypeScript.
- **Teach while you build.** Every module folder gets a `NOTES.md` containing: what this module does, why it's built this way, what breaks without it, and the 3-sentence version I'd say in an interview.

We're building **RideX**: riders request rides, nearby drivers get matched in real time, the trip is tracked live on a map, fare is calculated and paid, and an AI layer handles support and search.

**Quality bar:** no tutorial code. Handle the race conditions, the retries, and the failure paths — but keep the solutions simple enough that I can defend them.

---

## 1. Hard Constraints

- **No Docker, no Kubernetes, no docker-compose.** Anywhere. Use managed services (MongoDB Atlas, Upstash Redis, Render, Vercel).
- **TypeScript everywhere**, `strict: true`, no `any`, no `@ts-ignore`.
- **Layered architecture**: `route → controller → service → repository → model`. Controllers never contain business logic. Services never touch `req`/`res`.
- **No secrets in code.** Config validated on boot; crash if env is invalid.
- Every feature ships with tests. A phase isn't done until tests pass.
- Do not invent library APIs. If you're unsure of a signature, say so instead of guessing.
- Do not add a dependency that isn't in Section 2 without asking me first.

---

## 2. Tech Stack — this list is closed

**Backend**
- Node.js 20, Express, TypeScript
- MongoDB Atlas + Mongoose (`2dsphere` geo indexes)
- Redis (Upstash) — caching, `GEOADD`/`GEOSEARCH` driver index, locks, rate limiting, pub/sub
- Socket.IO + `@socket.io/redis-adapter`
- BullMQ — background jobs
- JWT (`jsonwebtoken`) + bcrypt — auth
- Zod — env + request validation
- Winston — centralized logging
- Jest + Supertest + `mongodb-memory-server` — testing
- Razorpay SDK (test mode) — payments
- OpenAI SDK — AI layer

**Frontend**
- React 19 + Vite + TypeScript
- **Redux Toolkit + RTK Query** (server state and client state both — this is the stack I know)
- Tailwind CSS
- React Router
- Socket.IO client
- MapLibre GL JS + OpenStreetMap tiles (free, no billing account needed)
- Recharts — earnings/admin charts

**Not in this project:** Docker, GraphQL, microservices, Kafka, Prisma, Next.js, vector databases, Zustand, TanStack Query.

---

## 3. Repository Structure

```
ridex/
├── docs/                      # BUILD_PROMPT, ARCHITECTURE, API, DEPLOYMENT, BENCHMARKS
├── server/src/
│   ├── config/                # env.ts (zod), db.ts, redis.ts, logger.ts
│   ├── modules/               # auth user driver ride pricing matching payment rating ai admin
│   │   └── <module>/          # controller, service, repository, model, routes, dto, NOTES.md, tests
│   ├── realtime/              # socket server, auth middleware, event handlers
│   ├── jobs/                  # queues, workers, schedulers
│   ├── middleware/            # auth, rbac, rateLimit, idempotency, requestId, errorHandler
│   ├── common/                # AppError, ApiResponse, asyncHandler, constants
│   ├── app.ts
│   └── server.ts
└── client/src/
    ├── app/                   # store, router
    ├── features/              # auth, ride, driver, admin — each with its RTK Query slice
    ├── components/ui/         # the design system from Section 6
    └── hooks/ lib/ types/
```

A module owns everything about its domain. Cross-module access goes through **services**, never another module's repository.

---

## 4. Domain Model

**User** — `name, email(unique), phone(unique), passwordHash, role: rider|driver|admin, isEmailVerified, isPhoneVerified, status`

**DriverProfile** — `userId, licenseNumber, vehicle{type: bike|auto|sedan|suv, model, plateNumber}, documents[{type,url,status}], verificationStatus, isOnline, currentLocation: GeoJSON Point, rating, totalTrips, acceptanceRate`

**Ride** — `rideCode, riderId, driverId, pickup{address, location}, drop{address, location}, vehicleType, status, fare{base, distance, time, surge, platformFee, tax, total}, distanceMeters, durationSeconds, otp, route[], timeline[{status, at, by}], cancellation{by, reason, fee}, paymentId, idempotencyKey`

**Payment** — `rideId, method: cash|upi|card, razorpayOrderId, razorpayPaymentId, amount, status, refund{}`

**Also:** `RefreshToken`, `OtpToken`, `SavedPlace`, `Rating`, `SupportTicket`, `AuditLog`, `PricingConfig`.

### Ride state machine — enforce it, invalid transitions throw

```
REQUESTED → SEARCHING → DRIVER_ASSIGNED → DRIVER_ARRIVING
          → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED
Anything before IN_PROGRESS → CANCELLED_BY_RIDER | CANCELLED_BY_DRIVER
SEARCHING → NO_DRIVERS_FOUND
IN_PROGRESS → COMPLETED only after OTP verification
```

Build a `RideStateMachine` class with an explicit transition table. Every transition appends to `timeline[]`. Never let a controller set `status` directly.

---

## 5. The Six Things That Make This "Production Level"

These are the interview weapons. Implement them properly and write a `NOTES.md` for each.

1. **Refresh token rotation with reuse detection.** Access token 15 min (in memory on the client), refresh token 7 days in an `httpOnly` cookie. Each refresh issues a new token and invalidates the old one. If an already-used refresh token shows up again, someone stole it — revoke the entire token family and force re-login.
2. **The double-accept race.** Two drivers tap Accept in the same millisecond. Solve it twice over: a Redis lock (`SET lock:ride:{id} {token} NX PX 5000`, released with a Lua compare-and-delete) **and** a conditional Mongo update (`findOneAndUpdate({_id, status: 'SEARCHING', driverId: null}, {...})`). Exactly one driver wins; the other gets a clean 409. Write a test that runs this 100 times.
3. **Idempotency keys.** `POST /rides` and all payment writes require an `Idempotency-Key` header. Store key → response in Redis for 24 h and replay on retry. A rider double-tapping "Confirm" on bad network must not create two rides.
4. **Redis as a geo index, not just a cache.** Driver locations live in a Redis geo set, updated on every ping and written to Mongo only every 30 s. Matching queries Redis, not the database. Measure and record the difference.
5. **Rate limiting with a Redis sliding window.** Tiered: auth 5/min/IP, OTP 3/10min/phone, ride creation 10/min/user.
6. **BullMQ with retries, backoff and a dead-letter queue.** Emails, receipts, driver payouts, stale-ride cleanup, rating aggregation, AI batch jobs. Nothing slow happens inside a request.

Plus the baseline, applied everywhere: Zod validation on every request, one `AppError` class and one global error handler returning `{ success, data, error: {code, message}, requestId }`, Winston logs with a request ID on every line and passwords/tokens/OTPs redacted, helmet + CORS allowlist + mongo-sanitize, graceful shutdown on SIGTERM, `/health` and `/ready` endpoints.

---

## 6. Design System — build this, don't improvise

The reason most ride-hailing clones look like clones is that they all reach for the same thing: a full-bleed dark map with a white rounded bottom sheet. **Do not build that.** Follow this system exactly.

### 6.1 Concept: "Milestone"

The visual language comes from Indian road infrastructure — kilometre stones, highway route boards, painted kerbs. A ride is a journey down a marked road, and the interface says so literally: a **vertical route line runs down the left edge of every ride screen**, with the pickup, the driver, and the drop as markers on it. As the ride progresses, the active marker travels down that line. The route line *is* the progress indicator, the status display, and the navigation spine — one device doing three jobs.

### 6.2 Tokens

```css
--ink:       #11201A;  /* text, route line */
--paper:     #F4F6F2;  /* app background */
--surface:   #FFFFFF;  /* cards */
--milestone: #1F6F4A;  /* primary: buttons, active route segment, driver marker */
--kerb:      #D7DCD3;  /* borders, inactive route segment */
--signal:    #E4572E;  /* RESERVED: surge, SOS, cancellation, errors only */
--night:     #0B1512;  /* dark mode background */
```

`--signal` is semantically reserved. If it appears on a screen, something is urgent or costs extra money. Never use it for decoration or a generic primary button.

### 6.3 Type

- **Archivo** (variable) — headings, fares, ETAs, route-board elements. Use its wider optical widths for numbers so a fare reads like a signboard.
- **IBM Plex Sans** — body, forms, labels. Swap to IBM Plex Sans Devanagari when Hindi copy appears.
- All money, distance, time and countdown values use `font-variant-numeric: tabular-nums` so digits don't jitter as they tick.
- No ALL-CAPS labels. No monospace for small data labels. Sentence case everywhere.

### 6.4 Layout rules

- Map sits in the **upper two-thirds**, clipped with a straight edge — not a floating sheet with a drag handle.
- The lower third is the **strip**: route line on the left, content to the right of it, one primary action anchored at the bottom in the thumb zone.
- Radius scale is meaningful, not uniform: `0px` on the map edge and route line, `4px` on inputs, `12px` on cards, `999px` only on the primary action. Never put the same radius on everything.
- Shadows: one, and only under the primary action. Elevation elsewhere comes from a `--kerb` hairline.
- Left-aligned everything. No centered body text.

### 6.5 The receipt

The completed-trip receipt is a **milestone stone**: a tall card with a notched top edge, the fare set large in Archivo, the route line running down its left side with pickup and drop as the two stops, and the breakdown as a simple list. It should be screenshot-worthy — this is the image that ends up in your README.

### 6.6 The driver app is deliberately a different product

It's used at a red light, one-handed, in sunlight. So:
- Type one full step larger throughout; minimum touch target 56px.
- Only one decision on screen at a time.
- The incoming-offer card shows the 15-second countdown as a **route line draining from full to empty**, not a spinner or a ring.
- Online/offline is a large physical-feeling switch, not a toggle in a settings menu.

Explaining *why* the two apps look different is a genuinely strong interview moment. Put the reasoning in `client/NOTES.md`.

### 6.7 Motion

- One orchestrated moment: the transition from "searching" to "driver assigned". Everything else is instant.
- Driver marker moves by interpolating between GPS pings over ~4 s so it glides instead of teleporting.
- Every animation respects `prefers-reduced-motion`.

### 6.8 Quality floor

Skeleton loaders shaped like the content (never a centered spinner). Optimistic UI on driver accept. Error boundaries. An offline banner that reconnects the socket automatically. Empty states that tell the user what to do next. Visible keyboard focus rings. Real copy, not lorem ipsum — buttons say what happens ("Confirm pickup", not "Submit"), and errors say what went wrong and how to fix it.

---

## 7. Build Phases

Do these in order. Each ends with: tests green, `NOTES.md` written, one commit.

**Phase 1 — Foundation.** Scaffold both apps. Strict TS, ESLint + Prettier. Zod env loader. Winston + request ID middleware. Mongo and Redis connection modules with retry. `AppError`, `asyncHandler`, response envelope, global error handler. `/health`, `/ready`. Graceful shutdown. Jest with `mongodb-memory-server`. GitHub Actions CI (install → typecheck → lint → test → build).

**Phase 2 — Auth.** Register/login for rider and driver. Email verification token. Phone OTP stored hashed in Redis, 5-min TTL, 3 attempts, constant-time compare. Refresh token rotation with reuse detection and token families. Session list + logout-all. Google OAuth. Forgot/reset password. RBAC middleware plus resource-ownership checks. Rate limits on every auth route.

**Phase 3 — Profiles & Admin.** Profile CRUD, avatar upload via Cloudinary. Driver onboarding: vehicle details, document upload, `pending → approved/rejected`. Admin endpoints to verify drivers, suspend users, read the audit log. Every admin action writes an `AuditLog`.

**Phase 4 — Pricing engine.** `POST /rides/estimate` → distance and duration from OSRM (free public API), fare breakdown per vehicle type from a `PricingConfig` document. Surge multiplier from live demand vs supply in a geohash cell over a 5-minute Redis window, capped at 2.5×. Estimates cached 60 s. Pricing functions are pure and fully unit tested — this is your easiest 100% coverage.

**Phase 5 — Realtime.** Socket.IO with JWT handshake auth, Redis adapter, rooms per user and per ride. Driver emits location every 4 s → server throttles → Redis `GEOADD` → Mongo every 30 s. Events: `ride:offer`, `ride:accepted`, `driver:location`, `ride:statusChanged`, `ride:completed`, `ride:cancelled`. On reconnect, `ride:sync` restores current state.

**Phase 6 — Matching & ride lifecycle (the core).** `POST /rides` (idempotent) → `SEARCHING` → matching job. Algorithm: `GEOSEARCH` 3 km, expand to 5 then 8 km; filter by online + verified + no active ride + vehicle type; rank by distance 60%, rating 25%, acceptance rate 15%; **offer sequentially with a 15-second timeout**, 3 rounds, then `NO_DRIVERS_FOUND`. Acceptance guarded by §5.2. Then arrival → **4-digit OTP to start the trip** → live route recording → completion → fare finalization → payment → receipt job → rating.
Cancellation policy: free before assignment, fee after N minutes, driver cancellations hurt their acceptance rate.

**Phase 7 — Payments.** Razorpay test mode: order on completion, signature verification, webhooks handled **idempotently** by event ID. Cash rides settle manually. Refunds for cancel-after-payment. Driver earnings as an **append-only ledger** — never overwrite a balance, always write an entry and derive the total. Weekly payout job.

**Phase 8 — AI layer (Section 8).**

**Phase 9 — Frontend.** Build to Section 6.
*Rider:* auth, map with pickup/drop search, saved places, vehicle selector with live fare and surge badge, searching state, live tracking, OTP screen, in-trip view, SOS, receipt, rating, history.
*Driver:* online switch, offer card with draining countdown, arrived → OTP → start → end, earnings dashboard, document status.
*Admin:* live map of active rides, verification queue, paginated tables, revenue charts, queue health.

**Phase 10 — Proof.** Load test with `autocannon`. Record **real** p95 latency before and after Redis caching in `docs/BENCHMARKS.md`. Write `docs/ARCHITECTURE.md` with mermaid diagrams (system overview, ride sequence, matching flow, state machine). Seed script with demo data. 90-second demo GIF in the README. Deploy.

---

## 8. AI Layer — three features, all explainable

Everything goes through `modules/ai/` with a timeout, retry limit and cost logger. **If the AI provider is down, the app still works** — every feature has a non-AI fallback.

**8.1 Support assistant with tool calling** *(the headline feature)*
OpenAI function calling with real tools: `getRideDetails`, `getFareBreakdown`, `cancelRide`, `raiseSupportTicket`, `requestRefund`. The model *requests* a tool; your backend *authorizes* it against the logged-in user before running it — a rider can never read someone else's ride, no matter what the prompt says. Anything with financial impact requires an explicit confirm step in the UI. Responses stream over SSE. Conversation history capped at the last 10 messages.
*Interview line:* "The LLM proposes actions, the backend enforces permissions. Prompt injection can't escalate privileges because the model never touches the database directly."

**8.2 Natural-language destination search**
"the cafe near the lake I went to last month" → the backend fetches the user's saved places and last 20 drop-offs, passes them to the model as a candidate list, and asks for a **structured JSON response** naming the best match with a confidence score. Low confidence falls back to normal text search. No vector database needed — the candidate set is small, and you can explain exactly why that's the right call.

**8.3 Trip summary & review intelligence**
A BullMQ batch job runs nightly: generates a one-line trip summary for the history list, and extracts sentiment plus aspects (driving, cleanliness, behaviour, punctuality) from rating comments into per-driver cards on the admin dashboard. Drivers with recurring safety complaints get auto-flagged for review.

*Optional stretch, only if Phases 1–9 are done:* a safety monitor that detects long unexplained stops or major route deviation using plain thresholds, and uses the model only to **classify** the situation before escalating. Thresholds decide when to act; the model never decides an emergency alone.

---

## 9. Deployment (no Docker)

- MongoDB Atlas free tier
- Upstash Redis free tier
- Backend on **Render**: build `npm ci && npm run build`, start `node dist/server.js`
- A **second Render service from the same repo** running `node dist/jobs/worker.js` — workers as a separate process is the correct architecture and it demos well
- Frontend on Vercel, images on Cloudinary
- Document every env var in `docs/DEPLOYMENT.md`

---

## 10. Definition of Done

- [ ] Live demo URL with seeded rider / driver / admin logins in the README
- [ ] README opens with the architecture diagram and the demo GIF
- [ ] `docs/ARCHITECTURE.md` + `docs/BENCHMARKS.md` with real measured numbers
- [ ] A `NOTES.md` in every module that I can revise from before an interview
- [ ] CI green on `main`; the double-accept race test passes 100 runs in a row
- [ ] Every claim I put on my resume is provable by a file in this repo

---

## 11. Working Agreement

- Before each phase, output a short plan (files, key decisions) and wait for my "go".
- Write tests in the same response as the implementation.
- After each phase: what you built, what you deliberately left out, and one question an interviewer would ask about it.
- If I ask for something that breaks Section 1, 2, or 5 — push back and tell me why.
