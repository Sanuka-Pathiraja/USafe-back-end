# SafePath Navigator Production Checklist

## 1. Database Migrations

Run all pending migrations before enabling traffic:

```bash
npm run migration:run
npm run safepath:preflight
npm run safepath:smoke
```

Critical tables:

- `guardian_routes_app`
- `guardian_route_progress`
- `trip_sessions`

Performance-critical index:

- `IDX_trip_sessions_status_expectedEndTime` on `trip_sessions(status, expectedEndTime)`

## 2. Required Environment Variables

Set and verify:

- `JWT_SECRET`
- `DATABASE_URL` or DB host/user/password fields used by datasource
- `QUICKSEND_EMAIL`
- `QUICKSEND_API_KEY`
- `SOS_SENDER_ID`
- `NODE_ENV=production`

Optional but recommended:

- `SAFETY_SCORE_TIMEOUT_MS` (default 8000, bounded to 1000-30000)
- `GUARDIAN_CHECKPOINT_RADIUS_METERS`
- `TRIP_SMS_RETRY_ATTEMPTS` (default 2, bounded to 1-3)
- `TRIP_SMS_RETRY_DELAY_MS` (default 600ms, bounded to 200-3000)
- `REQUEST_TIMEOUT_MS` (default 30000ms, bounded to 10000-120000, production-only)
- `TRIP_LOCATION_UPDATE_MIN_INTERVAL_MS` (default 10000ms, bounded to 1000-60000, prevents location update spam)

## 3. Security Checks

- Ensure no secrets are committed (`.env`, private key files, tokens).
- Confirm auth middleware does not log raw bearer tokens.
- Confirm public routes are rate-limited.
- Confirm tracking routes use stricter limits than general public endpoints.
- Confirm both `/trip/*` and `/api/trip/*` are rate-limited in production.

## 4. Functional Smoke Tests

1. Create a guardian route with valid checkpoints.
2. Track progress and verify checkpoint SMS notification.
3. Trigger guardian alert and confirm SMS sends.
4. Start trip session and verify tracking URL response.
5. Trigger SOS and verify emergency contacts receive SMS.
6. Restart server and confirm active trip timers are restored.
7. Send SIGTERM (or stop container) and confirm graceful shutdown logs show scheduler cleanup and DB close.

## 5. Monitoring

- Watch logs for structured trip events:
  - `TRIP_SESSION_STARTED`: New trip created
  - `TRIP_LOCATION_UPDATED`: Client location received
  - `TRIP_TIME_EXTENDED`: User requested time extension
  - `TRIP_COMPLETED_SAFE`: Trip ended safely without emergency
  - `TRIP_SOS_TRIGGERED`: Manual or automatic SOS activation
  - `TRIP_SOS_ESCALATION_DISPATCHED`: Emergency contacts SMS sent
  - `AUTO_SOS_TIMER_ERROR`, `TRIP_EXPIRY_SWEEP_ERROR`: Scheduler failures
  - `[AUTH] JWT_SECRET is not configured`: Missing JWT config
  - HTTP 408 responses (request timeout, check if `REQUEST_TIMEOUT_MS` is too aggressive)
- Add alerting on repeated 5xx for `/api/guardian/*` and `/trip/*`.
- Query trip event logs with `jq .event` to extract specific event types for dashboards.

SafePath runtime probe:

- `GET /api/guardian/self-check` (auth required) should return `success: true`.

## 6. Residual Risks

- Auto-SOS timers are in-process and restored on startup, but still not fully distributed-safe for multi-instance deployments.
- Add a persistent job queue if horizontally scaling the backend.

---

## Full Deployment Runbook

See [SafePath-Deployment-Runbook.md](SafePath-Deployment-Runbook.md) for comprehensive step-by-step deployment procedures, rollback plans, monitoring setup, and day-1 operations checklist.
