# USafe Backend API Documentation

## Overview

Production-ready Express.js backend for the USafe safety platform featuring real-time alerts, guardian route tracking, community reporting, and integrated payments.

**Base URL:** `http://localhost:5000` (dev) | `https://api.usafe.com` (production)

---

## 🏥 Health & Monitoring

### GET /health

Comprehensive health check showing all service status and configuration.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-20T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": { "status": "connected" },
    "supabase": { "status": "connected" },
    "sms": { "status": "configured", "provider": "QuickSend" },
    "calls": { "status": "configured", "provider": "Vonage" },
    "payment": { "status": "configured", "provider": "Stripe" }
  },
  "features": {
    "guardian": true,
    "safetyScore": true,
    "communityReports": true
  }
}
```

### GET /health/live

Kubernetes liveness probe.

### GET /health/ready

Kubernetes readiness probe.

---

## 👤 User Management

### POST /user/add

Create a new user account.

**Body:**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "age": 25,
  "phone": "+94771234567",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

### POST /user/login

Authenticate user and receive JWT token.

**Body:**

```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": 1, "email": "john@example.com" }
}
```

### POST /user/googleLogin

Login with Google OAuth.

**Body:**

```json
{
  "idToken": "google_id_token_here"
}
```

### GET /user/get

Get authenticated user profile (requires JWT).

**Headers:** `Authorization: Bearer <token>`

### PUT /user/update

Update user profile (requires JWT).

### DELETE /user/delete

Delete user account (requires JWT).

---

## 🛡️ Guardian SafePath Feature

All Guardian endpoints require JWT authentication.

### POST /api/guardian/routes

Create a new guardian route with checkpoints.

**Headers:** `Authorization: Bearer <token>`

**Body:**

```json
{
  "name": "School Route",
  "checkpoints": [
    {
      "name": "Home",
      "lat": 6.9271,
      "lng": 79.8612
    },
    {
      "name": "Park",
      "lat": 6.9311,
      "lng": 79.8658
    },
    {
      "name": "School",
      "lat": 6.9351,
      "lng": 79.8705
    }
  ],
  "is_active": true
}
```

**Response:**

```json
{
  "success": true,
  "route": {
    "id": 1,
    "user_id": 123,
    "route_name": "School Route",
    "checkpoints": [...],
    "is_active": true,
    "created_at": "2026-02-20T10:30:00.000Z"
  }
}
```

### GET /api/guardian/routes

List all guardian routes for authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "success": true,
  "routes": [
    {
      "id": 1,
      "route_name": "School Route",
      "checkpoints": [...],
      "is_active": true
    }
  ]
}
```

### POST /api/guardian/alert

Send checkpoint alert to parent/guardian.

**Headers:** `Authorization: Bearer <token>`

**Body:**

```json
{
  "routeName": "School Route",
  "checkpointName": "Park",
  "status": "arrived",
  "parentPhone": "+94771234567"
}
```

**Status values:** `arrived`, `danger`, `checkpoint`

**Response:**

```json
{
  "success": true,
  "method": "REAL_SMS",
  "smsResponse": { ... }
}
```

### GET /api/guardian/safety-score

### POST /api/guardian/safety-score

### GET /safety-score

### POST /safety-score

Get real-time safety score for a location. **Public endpoint** (no authentication required).

**Query Params:**

- `lat`: Latitude (required)
- `lng`: Longitude (required)

**Body (POST alternative):**

```json
{
  "location": {
    "lat": 6.9271,
    "lng": 79.8612
  }
}
```

The API also accepts alternate keys such as `latitude`/`longitude` and nested `coords` objects.

**Example:** `/api/guardian/safety-score?lat=6.9271&lng=79.8612`

**Response:**

```json
{
  "score": 63,
  "latitude": 6.9271,
  "longitude": 79.8612,
  "status": "success",
  "generatedAt": "2026-03-19T15:37:28Z",
  "closestHospitalKm": 0.44,
  "closestPoliceStationKm": null,
  "populationDensityPerKm2": 12468,
  "trafficLevel": "Low",
  "timeOfDay": "Night"
}
```

Notes:

- `closestHospitalKm` and `closestPoliceStationKm` may be `null` when external map providers are temporarily unavailable.
- Response includes both camelCase and snake_case aliases for compatibility with existing clients.
- Responses are cached briefly in-memory by rounded coordinates to improve latency and stability.

---

## 📞 Emergency Communication

### POST /call

Initiate emergency voice call.

**Body:**

```json
{
  "to": "+94771234567"
}
```

### POST /sms

Send single emergency SMS.

**Body:**

```json
{
  "to": "+94771234567",
  "message": "Emergency alert from USafe"
}
```

### GET /balance

Check SMS balance.

### POST /bulk-sms

Send SMS to multiple recipients.

**Body:**

```json
{
  "numbers": ["+94771234567", "+94777654321"],
  "message": "Safety alert"
}
```

---

## 📝 Community Reports

### POST /report/add

Submit a community safety report with photos.

**Headers:** `Authorization: Bearer <token>`

**Content-Type:** `multipart/form-data`

**Fields:**

- `reportContent`: Text description
- `location`: Location string
- `images_proofs`: File uploads (multiple)

---

## 👥 Contacts

### POST /contact/add

Add emergency contact.

**Body:**

```json
{
  "name": "Mom",
  "relationship": "Mother",
  "phone": "+94771234567"
}
```

### GET /contact/

List all contacts for user.

### PUT /contact/update/:id

Update contact details.

### DELETE /contact/delete/:id

Remove contact.

---

## 💳 Payments (Stripe)

### POST /payment/checkout

Create Stripe checkout session.

**Headers:** `Authorization: Bearer <token>`

**Body:**

```json
{
  "amount": 999,
  "currency": "usd",
  "description": "Premium Subscription"
}
```

### POST /webhook/stripe

Stripe webhook handler (called by Stripe).

---

## 🔐 Authentication

Most endpoints require JWT authentication via Bearer token:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Obtain token via `/user/login` or `/user/googleLogin`.

---

## ⚙️ Environment Configuration

Required environment variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=password
DB_NAME=usafe_db
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_key

# Authentication
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your_google_client_id

# SMS Provider
QUICKSEND_EMAIL=your_email
QUICKSEND_API_KEY=your_api_key
SOS_SENDER_ID=USafe

# Voice Calls
VONAGE_APPLICATION_ID=your_app_id
VONAGE_PRIVATE_KEY=./private.key
VONAGE_FROM_NUMBER=+1234567890

# Payments
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Optional
PORT=5000
NODE_ENV=production
PYTHON_EXECUTABLE=python3
SAFETY_SCORE_TIMEOUT_MS=8000
SAFETY_SCORE_CACHE_TTL_MS=60000
DB_CONNECTION_TIMEOUT_MS=10000
```

---

## 🚀 Rate Limits (Production)

- **Standard API endpoints:** 100 requests / 15 minutes
- **Authentication endpoints:** 10 requests / 15 minutes
- **SMS/Call endpoints:** 5 requests / hour
- **Health checks:** 300 requests / 15 minutes

---

## 📊 Error Responses

All errors follow this structure:

```json
{
  "error": "Error message",
  "details": "Additional context (optional)"
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `201` - Created
- `400` - Bad request / validation error
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden
- `404` - Not found
- `500` - Internal server error
- `502` - External service failure
- `503` - Service unavailable

---

## 🔧 Development

```bash
# Install dependencies
npm install

# Run migrations
npm run migration:run

# Start development server
npm start

# Generate new migration
npm run migration:generate -- -n MigrationName
```

---

## 📦 Production Deployment

1. Set `NODE_ENV=production`
2. Configure all required environment variables
3. Run database migrations
4. Ensure Python is available for safety scoring
5. Configure SSL certificates
6. Set up reverse proxy (nginx) with rate limiting
7. Enable monitoring for `/health` endpoint

---

## 🎯 Key Features for Pitch

✅ **Real-time Guardian Tracking** - Parents receive SMS alerts when children reach checkpoints  
✅ **AI Safety Scoring** - Python-powered location risk assessment  
✅ **Multi-channel Alerts** - SMS + Voice calls for emergencies  
✅ **Community Reporting** - Crowdsourced safety incidents with photo evidence  
✅ **Secure Authentication** - JWT + Google OAuth support  
✅ **Payment Integration** - Stripe for premium features  
✅ **Production-Ready** - Rate limiting, health checks, comprehensive error handling  
✅ **Database Migrations** - Schema versioning with TypeORM  
✅ **Multi-provider Communication** - QuickSend (SMS) + Vonage (Voice)

---

**Version:** 1.0.0  
**Last Updated:** February 20, 2026
