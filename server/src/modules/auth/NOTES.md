# Auth

## What this module does

Registers riders and drivers, logs them in, and keeps them logged in with a 15-minute JWT access token plus a 7-day refresh cookie. It also verifies email, checks phone OTPs, rotates refresh tokens, talks to Google’s OAuth endpoints, and lists or revokes sessions.

## Why it's built this way

The access token lives in memory on the client so XSS cannot steal a long-lived bearer token from `localStorage`. The refresh token is `httpOnly`, so JavaScript never sees it. Each refresh **invalidates the previous token**. If a stolen token is replayed, we revoke the whole family — that is reuse detection. Phone OTPs are hashed in Redis with a 5-minute TTL and compared with `crypto.timingSafeEqual` so a timing leak cannot brute-force the 6 digits. Google sign-in is plain `fetch` against Google’s token and userinfo URLs; Passport is not in the stack and would hide the flow.

## What breaks without it

Without rotation, stealing one cookie is a 7-day account takeover. Without reuse detection, the thief and the real rider both keep working and nobody notices. Without hashing OTPs, a Redis dump prints every code in flight. Without RBAC on `/users/:id`, any rider who guesses an ObjectId reads someone else’s profile.

## Interview version

Access tokens are short and held in RAM. Refresh tokens are opaque, stored as SHA-256 hashes, rotated on every use, and grouped into families. Replaying an old refresh token is treated as theft: we kill the family and force a new login. The LLM-era version of this talk is the same idea as the AI tools later — the client proposes a session, the server decides whether it is still valid.
