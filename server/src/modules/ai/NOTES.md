# AI

## What this module does

Three features behind `LlmPort`: support chat with tools (JSON plus optional SSE), natural-language place search over saved places + last 20 drops, and receipt-job trip summaries. Tools run only after the backend checks the logged-in user owns the ride. Cancel and refund need `confirm=true` from the UI.

## Why it's built this way

The model never gets a Mongo handle. Prompt injection can ask for another rider's trip; `RideService.get(userId, rideId)` still 403s. Place search does not use a vector DB because the candidate set is tiny and explainable.

## What breaks without it

Support would be a mailto: link, and "the cafe near the lake" would be a dead text box.

## Interview version

The LLM proposes `getRideDetails`; my service authorizes it. If the provider times out at 8s, a canned reply keeps the app usable. Low-confidence JSON from the model falls back to substring match on saved places.
