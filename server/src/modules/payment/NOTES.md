# Payments

## What this module does

Creates a payment after `COMPLETED`. Cash captures immediately. UPI/card create a Razorpay order; checkout signature or a webhook marks it captured. Webhooks are idempotent on Razorpay `event.id`. Driver pay is an append-only ledger: earnings, refund clawbacks, weekly payouts. Balance is always `SUM(amount)`, never a stored number.

## Why it's built this way

If we incremented `driver.balance`, a double webhook would mint money. A unique `WebhookEvent` row plus an early return on already-captured payments makes retries safe. Razorpay is behind a port so tests never talk to the internet.

## What breaks without it

Completion would say "paid" with no money trail, and a replayed webhook would pay the driver twice.

## Interview version

The ledger is the account. Razorpay is a receipt printer. Webhook idempotency is a unique event id, not a cache TTL. I can refund a captured ride and the clawback is just another negative row.
