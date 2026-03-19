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

- Watch logs for:
  - `TRIP_SOS_ESCALATION_DISPATCHED`
  - `AUTO_SOS_TIMER_ERROR`
  - `TRIP_EXPIRY_SWEEP_ERROR`
  - `[AUTH] JWT_SECRET is not configured`
- Add alerting on repeated 5xx for `/api/guardian/*` and `/trip/*`.

SafePath runtime probe:

- `GET /api/guardian/self-check` (auth required) should return `success: true`.

## 6. Residual Risks

- Auto-SOS timers are in-process and restored on startup, but still not fully distributed-safe for multi-instance deployments.
- Add a persistent job queue if horizontally scaling the backend.
