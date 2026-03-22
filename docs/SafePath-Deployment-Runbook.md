# SafePath Guardian Deployment Runbook

## Pre-Deployment Checklist (Development → Staging)

### 1. Environment Preparation

```bash
# Verify all required environment variables are set
npm run safepath:preflight

# Expected output: All required vars green, warnings listed for recommended vars
```

**Required variables (must be set):**

- `JWT_SECRET` (min 32 chars, production use strong random string)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- `QUICKSEND_EMAIL`, `QUICKSEND_API_KEY`
- `SOS_SENDER_ID`
- `NODE_ENV=production`

**Recommended to set:**

- `SAFETY_SCORE_TIMEOUT_MS` (default 8000)
- `TRIP_EXPIRY_SWEEP_MS` (default 15000)
- `TRIP_SMS_RETRY_ATTEMPTS` (default 2)
- `TRIP_SMS_RETRY_DELAY_MS` (default 600)
- `TRIP_LOCATION_UPDATE_MIN_INTERVAL_MS` (default 10000)
- `REQUEST_TIMEOUT_MS` (default 30000)

### 2. Database Setup

```bash
# Run all pending migrations
npm run migration:run

# Verify tables were created
psql $DATABASE_URL -c "\dt"

# Expected tables:
# - trip_sessions
# - guardian_routes_app
# - guardian_route_progress
# - users
# - contacts
# - payments
# - sms_logs
# - community_reports
```

**Critical index verification:**

```bash
psql $DATABASE_URL -c "\di" | grep -i trip

# Expected index: IDX_trip_sessions_status_expectedEndTime
```

### 3. Pre-Deployment Testing

```bash
# Run all unit and integration tests
npm test

# Expected: 21/21 tests passing (11 utility + 10 trip integration)
```

### 4. Smoke Test Against Staging

```bash
# With staging server running on staging URL:
SMOKE_BASE_URL=https://staging-api.usafe.app \
SMOKE_AUTH_TOKEN=$STAGING_JWT_TOKEN \
npm run safepath:smoke

# Expected output: 5/5 checks passed
# - /health (200 or 503)
# - /api/guardian/safety-score invalid input (400)
# - /api/guardian/tracking invalid format (400)
# - /api/guardian/tracking sample token (200 or 404)
# - /api/guardian/self-check auth gate (200 or 503 with auth, 401 without)
```

### 5. Self-Check Endpoint Verification

```bash
curl -H "Authorization: Bearer $STAGING_JWT_TOKEN" \
  https://staging-api.usafe.app/api/guardian/self-check

# Expected response:
# {
#   "success": true,
#   "message": "SafePath services operational",
#   "data": {
#     "dbConnected": true,
#     "smsProviderConfigured": true,
#     "safetyScorierAvailable": true,
#     "timestamp": "2026-03-19T..."
#   }
# }
```

## Deployment Steps (Staging → Production)

### 1. Pre-Flight Validation

```bash
# Run preflight on production environment
npm run safepath:preflight

# All required environment variables must be green (no failures)
```

### 2. Database Migration (Production)

```bash
# Execute migrations on production database
npm run migration:run

# Verify migration success
psql $PRODUCTION_DATABASE_URL -c "SELECT * FROM \"typeorm_metadata\" ORDER BY \"timestamp\" DESC LIMIT 5;"

# Confirm trip_sessions table exists with correct schema
psql $PRODUCTION_DATABASE_URL -c "\d trip_sessions"
```

### 3. Application Deployment

**Option A: Container Deployment (Recommended)**

```bash
# Build and push Docker image
docker build -t usafe-backend:${VERSION} .
docker tag usafe-backend:${VERSION} your-registry/usafe-backend:${VERSION}
docker push your-registry/usafe-backend:${VERSION}

# Deploy to Kubernetes or Docker Swarm
kubectl set image deployment/usafe-api usafe-api=your-registry/usafe-backend:${VERSION}

# Monitor rollout
kubectl rollout status deployment/usafe-api
```

**Option B: Direct Node.js Deployment**

```bash
# Stop existing process
pm2 stop USafe-backend || true

# Install dependencies
npm ci --omit=dev

# Start with process manager
pm2 start index.js --name USafe-backend --instances max --exec-mode cluster

# Monitor processes
pm2 monit
```

### 4. Post-Deployment Validation

```bash
# 1. Verify server is running and healthy
curl https://api.usafe.app/health

# Expected: 200 with { "status": "ok" }

# 2. Verify self-check passes
curl -H "Authorization: Bearer $PROD_JWT_TOKEN" \
  https://api.usafe.app/api/guardian/self-check

# Expected: 200 with success: true and all checks passing

# 3. Verify authentication works
curl -X POST https://api.usafe.app/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"..."}'

# Expected: 200 with valid JWT token

# 4. Verify trip creation endpoint
curl -X POST https://api.usafe.app/trip/start \
  -H "Authorization: Bearer $TEST_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "tripName": "Test Trip",
    "durationMinutes": 30,
    "contactIds": [1,2]
  }'

# Expected: 201 with Trip session created
```

### 5. Monitoring and Alerting Setup

**Application Metrics to Monitor:**

```bash
# 1. Request latency
# Alert if p95 latency > 2000ms for /api/trip/* endpoints
# Alert if p95 latency > 3000ms for /api/guardian/* endpoints

# 2. Error rates
# Alert if 5xx rate > 1% on any endpoint
# Alert if 429 (rate limit) responses > 10/min on /api/guardian/tracking

# 3. Trip lifecycle metrics
# Log: TRIP_SESSION_STARTED, TRIP_COMPLETED_SAFE, TRIP_SOS_TRIGGERED
# Alert if SOS events spike unexpectedly (> 10/hour)

# 4. SMS escalation success
# Monitor: TRIP_SOS_ESCALATION_DISPATCHED event
# Alert if sent < failed by more than 50%

# 5. Scheduler health
# Monitor: TRIP_EXPIRY_SWEEP_ERROR, AUTO_SOS_TIMER_ERROR
# Alert if these errors occur more than once per hour
```

**Example Prometheus Rules:**

```yaml
groups:
  - name: safepath.rules
    rules:
      - alert: HighTripAPIErrorRate
        expr: rate(http_requests_total{endpoint=~"/api/trip.*",status=~"5.."}[5m]) > 0.01
        for: 5m
        annotations:
          summary: "High error rate on trip API endpoints"

      - alert: TripSMSEscalationFailure
        expr: increase(trip_sms_escalation_failed_total[1h]) > 10
        annotations:
          summary: "Trip SOS SMS escalations failing"

      - alert: SchedulerErrors
        expr: increase(trip_scheduler_error_total[1h]) > 1
        annotations:
          summary: "Trip scheduler experiencing errors"
```

**Log-Based Monitoring (using jq):**

```bash
# Monitor trip lifecycle events
tail -f app.log | jq 'select(.event == "TRIP_SESSION_STARTED")'

# Monitor SOS events
tail -f app.log | jq 'select(.event | contains("SOS"))'

# Monitor errors
tail -f app.log | jq 'select(.level == "ERROR")'

# Count escalations by hour
cat app.log | jq 'select(.event == "TRIP_SOS_ESCALATION_DISPATCHED")' \
  | jq '.timestamp' \
  | cut -d'T' -f2 | cut -d':' -f1 | sort | uniq -c
```

### 6. Rollback Plan

**If critical issues occur within first hour:**

```bash
# Immediate rollback
kubectl rollout undo deployment/usafe-api

# OR if using pm2:
pm2 delete USafe-backend
git checkout previous-release-tag
npm install --omit=dev
pm2 start index.js --name USafe-backend
```

**Manual verification after rollback:**

```bash
# Verify old version is running
curl https://api.usafe.app/health | jq '.version'

# Check logs for any lingering errors
pm2 logs USafe-backend --lines 100
```

## Day-1 Operations Checklist

### Morning (UTC+5:30 IST)

- [ ] Review overnight logs for errors/SOS events
- [ ] Verify trip sessions table size growth is normal (~1-10 rows/hour per active user)
- [ ] Check SMS escalation metrics (target: >95% success rate)
- [ ] Verify self-check endpoint returns 200
- [ ] Monitor active trips in DB: `SELECT COUNT(*) FROM trip_sessions WHERE status = 'ACTIVE';`

### End of Business

- [ ] Generate daily metrics report (errors, SOS events, SMS success rate)
- [ ] Backup production database
- [ ] Review structured logs for anomalies
- [ ] Confirm no unplanned downtime

## Common Troubleshooting

### Preflight Fails: "JWT_SECRET is not configured"

**Fix:**

```bash
# Set in environment before starting
export JWT_SECRET=$(openssl rand -base64 32)

# Verify preflight passes
npm run safepath:preflight
```

### Smoke Test Fails: "fetch failed"

**Cause:** API server not running or unreachable

**Fix:**

```bash
# Check if server is listening
curl http://localhost:5000/health

# Check DNS resolution
nslookup api.usafe.app

# Verify firewall allows 443/80
nc -zv api.usafe.app 443
```

### Migration Fails: "relation already exists"

**Cause:** Migrations were already run on this DB

**Fix:**

```bash
# Check migration history
psql $DATABASE_URL -c "SELECT * FROM \"typeorm_metadata\" WHERE \"type\" = 'migration';"

# If safe to reset (non-prod only):
npm run migration:revert
npm run migration:run
```

### High Error Rate on /trip/\*/location

**Cause:** Clients sending updates faster than 10-second rate limit

**Fix:**

```bash
# Increase rate limit (cautiously)
export TRIP_LOCATION_UPDATE_MIN_INTERVAL_MS=5000

# Educate clients to respect 429 responses
# Example client code: wait indicated seconds before retry
```

### SOS Escalation Not Sending

**Cause:** SMS provider credentials invalid or rate-limited

**Fix:**

```bash
# Test SMS provider directly
curl -X POST https://quicksend-api.endpoint/send \
  -H "Authorization: Bearer $QUICKSEND_API_KEY" \
  -d '{"to":"123456789","body":"test"}'

# Check logs for SMS provider errors
tail -f app.log | jq 'select(.error | contains("SMS"))'

# Verify QUICKSEND_API_KEY is correct
# Verify SOS_SENDER_ID matches approved sender ID in provider account
```

## Monitoring Dashboard Setup (Optional)

**Example Grafana Dashboard JSON:**

```json
{
  "dashboard": {
    "title": "SafePath Guardian",
    "panels": [
      {
        "title": "Active Trips",
        "targets": [
          {
            "expr": "SELECT COUNT(*) FROM trip_sessions WHERE status = 'ACTIVE'"
          }
        ]
      },
      {
        "title": "SOS Events / Hour",
        "targets": [
          {
            "expr": "rate(trip_sos_events_total[1h])"
          }
        ]
      },
      {
        "title": "SMS Escalation Success Rate",
        "targets": [
          {
            "expr": "rate(sms_success_total[1h]) / rate(sms_attempts_total[1h])"
          }
        ]
      },
      {
        "title": "API Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~'5..'}[5m])"
          }
        ]
      }
    ]
  }
}
```

## Success Criteria

SafePath is **production-ready** when:

✅ All preflight checks pass  
✅ All migrations execute successfully  
✅ All smoke tests pass against production  
✅ Self-check endpoint returns 200 with 100% healthy status  
✅ No errors in application logs for 15 minutes  
✅ Monitoring/alerting rules are firing (tested with synthetic events)  
✅ Team has validated trip lifecycle e2e (create → update location → extend time → end safe)  
✅ Team has validated SOS path e2e (create → trigger SOS → verify escalation SMS sent)  
✅ Rollback procedure has been tested and documented

**Estimated time to readiness:** 1-2 hours for new environment setup
