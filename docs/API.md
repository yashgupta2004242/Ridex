# HTTP API (short)

Envelope: `{ success, data, error: { code, message } | null, requestId }`.

Auth: `Authorization: Bearer <access>`. Refresh cookie is httpOnly.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/ready` | Mongo + Redis |
| POST | `/auth/register` | rider/driver |
| POST | `/auth/login` | |
| POST | `/rides/estimate` | fare + surge |
| POST | `/rides` | `Idempotency-Key` |
| GET | `/rides` | history |
| GET | `/rides/active` | |
| POST | `/rides/:id/accept` | double-accept safe |
| POST | `/payments` | `Idempotency-Key` |
| POST | `/payments/webhook` | Razorpay |
| GET | `/drivers/me/earnings` | ledger SUM |
| POST | `/ai/chat` | tools, 10 messages |
| POST | `/ai/chat/stream` | SSE tokens after the model returns |
| POST | `/ai/search` | saved places + last 20 drops |
| POST | `/ai/sos` | ticket |
| GET | `/admin/stats` | captured totals |
| GET | `/admin/rides/live` | |

Socket.IO events: `ride:offer`, `ride:accepted`, `driver:location`, `ride:statusChanged`, `ride:completed`, `ride:cancelled`, `ride:sync`.
