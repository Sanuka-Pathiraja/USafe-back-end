# USafe Backend

[![Status](https://img.shields.io/badge/status-production--ready-green)]()
[![Node](https://img.shields.io/badge/node-24.13.0-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Website](https://img.shields.io/badge/website-usafe.lk-blue)](https://www.usafe.lk)

**Real-time safety platform backend featuring guardian tracking, AI-powered risk assessment, and emergency communication.**

Website: [www.usafe.lk](https://www.usafe.lk)

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Database & Migrations](#database--migrations)
- [Running Tests](#running-tests)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [External Services](#external-services)
- [Feature Toggles](#feature-toggles)
- [Deployment Checklist](#deployment-checklist)

---

## Key Features

### Guardian SafePath

- **Route Management**: Parents define safe routes with GPS checkpoints
- **Real-time Alerts**: Automatic SMS notifications when children reach checkpoints
- **Multi-status Tracking**: Arrived, Danger, Checkpoint status
- **Secure Storage**: User-isolated route data with PostgreSQL

### AI Safety Scoring

- **Python ML Engine**: Real-time location risk assessment (0-100 score)
- **Configurable Timeout**: Production-safe process management
- **Coordinate Validation**: Range checking and sanitization

### Multi-Channel Communication

- **SMS Alerts**: QuickSend & Notify.lk integration for instant notifications
- **Voice Calls**: Vonage-powered emergency calling
- **Rate Limited**: Protection against abuse (5 requests/hour)

### User Management

- **JWT Authentication**: Stateless, scalable session management
- **Password Security**: Bcrypt hashing with salt rounds
- **Google OAuth**: Social login integration
- **Profile Management**: Full CRUD operations

### Community Safety

- **Incident Reporting**: Photo evidence with location tagging
- **Crowdsourced Data**: Build safety heatmaps
- **Authenticated Submissions**: Prevent spam and abuse

### Payment Integration

- **Stripe Checkout**: Premium feature subscriptions
- **PayHere**: LKR payment processing
- **Webhook Handling**: Automated payment verification
- **Transaction Logging**: Full audit trail

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24 (ES Modules) |
| Framework | Express v5 |
| Database | PostgreSQL via Supabase |
| ORM | TypeORM |
| Auth | JWT + Google OAuth 2.0 |
| Voice Calls | Vonage (primary), Twilio (demo fallback) |
| SMS | Notify.lk, QuickSend |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Payments | Stripe, PayHere |
| Maps / Routing | Mapbox, Google Maps/Places |
| File Storage | Local filesystem (`/uploads`) + Supabase Storage |
| ML | Python |
| Testing | Vitest |

---

## Prerequisites

- Node.js v18 or higher
- A PostgreSQL database (Supabase recommended)
- Accounts for any external services you plan to use (see [External Services](#external-services))

---

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url>
cd SafeZone

# 2. Install dependencies
npm install

# 3. Copy the example env file and fill in your values
cp .env.example .env

# 4. Run database migrations
npm run migration:run

# 5. Start the development server
npm start
```

The server starts on `http://localhost:5000` by default (configurable via `PORT`).

Health check: `GET /health` → `{ "ok": true, "message": "Backend is reachable" }`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your credentials.

### Required for core functionality

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens (32+ characters) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/service key |

### Optional by feature

| Feature | Variables needed |
|---|---|
| Google Login | `GOOGLE_CLIENT_ID` |
| Voice calls (Vonage) | `VONAGE_APPLICATION_ID`, `VONAGE_FROM_NUMBER`, `VONAGE_PRIVATE_KEY` |
| SMS (Notify.lk) | `NOTIFYLK_USER_ID`, `NOTIFYLK_API_KEY`, `NOTIFYLK_SENDER_ID` |
| SMS (QuickSend) | `QUICKSEND_EMAIL`, `QUICKSEND_API_KEY` |
| Push notifications (FCM) | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Safe routing | `MAPBOX_TOKEN` |
| Payments (Stripe) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Payments (PayHere) | `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET` |
| Safety scoring | `GOOGLE_MAPS_API_KEY`, `OPENWEATHER_API_KEY` |

See `.env.example` for the complete list.

---

## Running the Server

```bash
# Development (auto-restart with nodemon)
npm start

# Production
node index.js
```

---

## Database & Migrations

The project uses TypeORM with TypeScript migration files.

```bash
# Run all pending migrations
npm run migration:run

# Generate a new migration (after changing a Model)
npm run migration:generate -- src/migrations/MigrationName

# Run TypeORM CLI directly
npm run typeorm -- <command>
```

Migration files live in `src/migrations/`. The database schema includes tables for users, contacts, community reports, trip sessions, emergency sessions, payments, SMS logs, push notification logs, and device tokens.

---

## Running Tests

The test suite uses Vitest. All external services (database, SMS, calls, payments, Firebase) are mocked — no real API calls are made.

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run a single test file
npx vitest run __tests__/controllers/UserController.test.js
```

**216 tests** across **26 test files** covering all controllers, services, middleware, and utilities.

---

## API Reference

All protected routes require a JWT bearer token: `Authorization: Bearer <token>`

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/user/add` | — | Register with email/password |
| POST | `/user/login` | — | Login with email/password |
| POST | `/user/googleLogin` | — | Login with Google ID token |

### User

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/user/get` | JWT | Get current user profile |
| PUT | `/user/update` | JWT | Update profile |
| DELETE | `/user/delete` | JWT | Delete account |
| GET | `/user/contacts` | JWT | Get user's emergency contacts |
| GET | `/user/community-report-count` | JWT | Get own report count |

### Emergency Contacts

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/contact/contacts` | JWT | List all contacts |
| POST | `/contact/contacts` | JWT | Add a contact |
| PUT | `/contact/contacts/:contactId` | JWT | Update a contact |
| DELETE | `/contact/contacts/:contactId` | JWT | Remove a contact |
| POST | `/contact/contacts/:contactId/alert` | JWT | Send alert SMS to a contact |

### Emergency Process

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/emergency/start` | JWT | Start an emergency session (sends SMS to contacts) |
| GET | `/emergency/:sessionId/status` | JWT | Get emergency session status |
| POST | `/emergency/:sessionId/cancel` | JWT | Cancel emergency and notify contacts |
| POST | `/emergency/:sessionId/call/:contactIndex/start` | JWT | Call a specific contact |
| POST | `/emergency/:sessionId/call/:contactIndex/attempt` | JWT | Retry a call attempt |
| GET | `/emergency/:sessionId/call/:callId/status` | JWT | Get call status |
| POST | `/emergency/:sessionId/call-119` | JWT | Call emergency services (119) |
| POST | `/webhooks/voice-event` | — | Vonage voice event webhook |

**Dev-only endpoints** (should be disabled in production):

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/emergency/:sessionId/dev/mark-answered` | JWT | Simulate call answered |
| POST | `/emergency/:sessionId/dev/reset` | JWT | Reset session to ACTIVE |

### Silent Call

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/emergency/silent-call` | JWT | Trigger a silent call to emergency contacts |

### Trip Monitoring

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/trip/start` | JWT | Start a trip session |
| PUT | `/api/trip/:tripId/location` | JWT | Update current location |
| PUT | `/api/trip/:tripId/add-time` | JWT | Extend expected trip duration |
| POST | `/api/trip/:tripId/end-safe` | JWT | Mark trip as completed safely |
| POST | `/api/trip/:tripId/sos` | JWT | Trigger SOS during trip |

### Community Reports

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/report/add` | JWT | Submit a safety report (supports image uploads) |
| GET | `/report/feed` | JWT | Get community feed (paginated, filterable by location/type) |
| GET | `/report/my-reports` | JWT | Get own reports |
| GET | `/report/:reportId` | JWT | Get report details |
| DELETE | `/report/:reportId` | JWT | Delete own report |
| POST | `/report/:reportId/like` | JWT | Like a report |
| DELETE | `/report/:reportId/like` | JWT | Unlike a report |
| GET | `/report/:reportId/comments` | JWT | Get comments on a report |
| POST | `/report/:reportId/comments` | JWT | Add a comment |
| POST | `/report/live-safety-score` | JWT | Calculate safety score for a location |

### Safe Route

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/safe-route` | — | Get a safe route avoiding reported danger zones |
| POST | `/safe-route` | — | Same as above (POST variant) |

### Push Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/notification/device-token` | JWT | Register FCM device token |
| DELETE | `/notification/device-token` | JWT | Unregister device token |

### Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payment/checkout` | JWT | Create a Stripe checkout session |
| POST | `/webhook/stripe` | — | Stripe webhook receiver |

### SMS / Call (Internal / Admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/sms` | — | Send a single SMS via QuickSend |
| GET | `/balance` | — | Check SMS provider balance |
| POST | `/bulk-sms` | — | Send bulk SMS via QuickSend |
| POST | `/sms/notify/bulk` | — | Send bulk SMS via Notify.lk |
| POST | `/call` | — | Initiate an SOS call |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server health check |

---

## Project Structure

```
SafeZone/
├── CallFeat/          # Voice & SMS provider integrations (Vonage, Notify.lk, QuickSend, Twilio)
├── Controller/        # Request handlers and business logic
├── Model/             # TypeORM entity definitions
├── Routers/           # Express route definitions
├── config/            # Database, Supabase, and PayHere configuration
├── middleware/        # Auth middleware (JWT verification)
├── services/          # Shared services (FCM, SMS builders, safety notifications)
├── utils/             # Pure utility functions (distance, zone checking, hashing, etc.)
├── src/migrations/    # TypeORM database migration files
├── docs/              # Feature-level integration guides
├── __tests__/         # Vitest unit tests
│   ├── controllers/
│   ├── services/
│   └── utils/
├── uploads/           # User-uploaded image files (served statically)
├── index.js           # Application entry point
└── package.json
```

---

## External Services

| Service | Purpose | Required? |
|---|---|---|
| **Supabase** (PostgreSQL) | Primary database and file storage | Yes |
| **Vonage** | Outbound emergency voice calls | For call features |
| **Notify.lk** | Emergency SMS to contacts | For SMS features |
| **QuickSend** | Bulk SMS / alternative SMS | For bulk SMS features |
| **Twilio** | Demo/fallback voice calls | Optional |
| **Firebase FCM** | Push notifications (Android/iOS/Web) | For push notifications |
| **Google OAuth 2.0** | Social login | For Google login |
| **Google Maps/Places** | Location data for safety scoring | For safety scoring |
| **Mapbox** | Safe route calculation | For safe routing |
| **OpenWeather** | Weather data for safety scoring | For safety scoring |
| **Stripe** | Payment processing | For payments |
| **PayHere** | LKR payment processing | For payments (LK) |

---

## Feature Toggles

Set these in `.env` to disable specific features without code changes:

| Variable | Effect |
|---|---|
| `DISABLE_CALLS=true` | Disables all outbound voice calls |
| `DISABLE_SMS=true` | Disables all single SMS sending |
| `DISABLE_BULK_SMS=true` | Disables all bulk SMS sending |
| `ALLOW_DEMO_CALL_FALLBACK=true` | Uses demo call IDs when Vonage fails (dev only) |
| `ALLOW_DEV_CUSTOM_CALL_TARGET=true` | Allows custom call targets in dev mode |
| `NODE_ENV=development` | Skips Stripe signature verification on webhooks |

---

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure strong `JWT_SECRET` (32+ chars)
- [ ] Set up SSL certificates
- [ ] Configure reverse proxy (nginx)
- [ ] Enable rate limiting
- [ ] Set up monitoring (health endpoint)
- [ ] Configure backup strategy
- [ ] Test SMS/Voice providers
- [ ] Run database migrations
- [ ] Validate Python availability

---

## License

MIT License - See LICENSE file for details

---

*Built with love for safer communities — [www.usafe.lk](https://www.usafe.lk)*
