# Admin and audit log

## What this module does

Admin-only routes: pending driver queue, approve/reject, suspend/reinstate users, paginated audit log. **Every admin action inserts an `AuditLog` row** before returning.

## Why it's built this way

If an admin “fixes” a driver in Mongo by hand, you cannot answer “who approved this?” in a viva. The service writes the domain change and the audit row together. Suspend also calls `AuthService.logoutAll` so a banned rider cannot keep using a refresh cookie.

## What breaks without it

A disgruntled intern could approve themselves and leave no trace. A suspended user would still mint access tokens for 7 days.

## Interview version

RBAC is the door. The audit log is the camera. I never overwrite a log line — I only insert. That is the same append-only idea we will use for the driver earnings ledger in payments.
