# SafePath Navigator Production Checklist

## 1. Database Migrations

Run all pending migrations before enabling traffic:

```bash
npm run migration:run
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

## 3. Security Checks

- Ensure no secrets are committed (`.env`, private key files, tokens).
- Confirm auth middleware does not log raw bearer tokens.
- Confirm public routes are rate-limited.
- Confirm tracking routes use stricter limits than general public endpoints.

## 4. Functional Smoke Tests

1. Create a guardian route with valid checkpoints.
2. Track progress and verify checkpoint SMS notification.
3. Trigger guardian alert and confirm SMS sends.
4. Start trip session and verify tracking URL response.
5. Trigger SOS and verify emergency contacts receive SMS.
6. Restart server and confirm active trip timers are restored.

## 5. Monitoring

- Watch logs for:
  - `TRIP_SOS_ESCALATION_DISPATCHED`
  - `AUTO_SOS_TIMER_ERROR`
  - `[AUTH] JWT_SECRET is not configured`
- Add alerting on repeated 5xx for `/api/guardian/*` and `/trip/*`.

SafePath runtime probe:

- `GET /api/guardian/self-check` (auth required) should return `success: true`.

## 6. Residual Risks

- Auto-SOS timers are in-process and restored on startup, but still not fully distributed-safe for multi-instance deployments.
- Add a persistent job queue if horizontally scaling the backend.
