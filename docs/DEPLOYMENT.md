# Deployment (no Docker)

## Services

| Piece | Where |
| --- | --- |
| MongoDB | Atlas free cluster, database `ridex` |
| Redis | Upstash, `rediss://` URL |
| API | Render web service, root of this repo |
| Worker | Second Render service, same repo, start `node dist/jobs/worker.js` |
| Client | Vercel, `client/` as root |
| Images | Cloudinary |

## Render API

- Build: `npm ci && npm run build -w server`
- Start: `node --env-file=.env dist/server.js` if you bake env into a file; on Render, use dashboard env and `node dist/server.js` from `server/`
- Health: `/health` and `/ready`

Set the Render root directory to `server` **or** start with `node server/dist/server.js` from the repo root after a workspace build.

## Render worker

Same build. Start `node dist/jobs/worker.js` from `server/`. This process runs matching, receipts, and trip summaries. It must not share the API's Node event loop.

## Vercel

Root `client`. Build `npm run build`. Output `dist`. Proxy `/api` and Socket.IO to the Render URL via `client/vite.config.ts` rewrite in production (`VITE_API_URL`).

## Env vars

| Name | Required | Used for |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `PORT` | Render sets | HTTP |
| `LOG_LEVEL` | no | Winston |
| `MONGODB_URI` | yes | Atlas |
| `REDIS_URL` | yes | Upstash |
| `CORS_ORIGINS` | yes | comma list including the Vercel origin |
| `CLIENT_URL` | yes | OAuth redirects |
| `JWT_ACCESS_SECRET` | yes | ≥32 chars |
| `JWT_REFRESH_SECRET` | yes | ≥32 chars |
| `BCRYPT_ROUNDS` | no | default 12 |
| `GOOGLE_CLIENT_ID` | OAuth | Google |
| `GOOGLE_CLIENT_SECRET` | OAuth | Google |
| `GOOGLE_REDIRECT_URI` | OAuth | API callback |
| `CLOUDINARY_*` | uploads | avatars / docs |
| `OSRM_BASE_URL` | no | public OSRM |
| `RAZORPAY_KEY_ID` | payments | test mode |
| `RAZORPAY_KEY_SECRET` | payments | signatures |
| `RAZORPAY_WEBHOOK_SECRET` | webhooks | HMAC |
| `OPENAI_API_KEY` | no | AI; empty → fallback |
| `OPENAI_MODEL` | no | default `gpt-4o-mini` |

## Razorpay webhook

Point test-mode webhooks at `https://<api>/payments/webhook`. HMAC uses the raw body captured in `express.json` `verify`.
