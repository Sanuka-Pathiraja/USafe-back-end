# USafe_back_end — Testing Guide

All tests are written with **Vitest**. No real database, SMS, call, or payment API calls are made — everything external is mocked. You only need Node.js and the project dependencies installed.

---

## 1. Install Dependencies

Run this from the project root (`SafeZone/`):

```bash
npm install
```

That's all — Vitest is already listed as a dev dependency in `package.json`. No extra global installs needed.

---

## 2. Run All Tests

```bash
npm test
```

Expected output: **230 tests passing across 29 test files**

---

## 3. Watch Mode (re-runs on file save)

```bash
npm run test:watch
```

---

## 4. Run a Single Test File

Copy the line for whichever file you want to test:

### CallFeat

```bash
# Notify.lk balance checker
npx vitest run __tests__/CallFeat/notifylkStatus.test.js
```

### Controllers

```bash
# User (register, login, Google login)
npx vitest run __tests__/controllers/UserController.test.js

# Contacts (list, add, update, delete, alert)
npx vitest run __tests__/controllers/ContactController.test.js

# Emergency process (start, cancel, call status, session status, webhooks, dev tools)
npx vitest run __tests__/controllers/EmergencyProcessController.test.js

# Silent call
npx vitest run __tests__/controllers/SilentCallController.test.js

# Trip monitoring (start, location update, add time, end safe, SOS)
npx vitest run __tests__/controllers/TripController.test.js

# Community reports (create, details, delete, like, comment)
npx vitest run __tests__/controllers/CommunityReportController.test.js

# Community feed (pagination, filters, proximity)
npx vitest run __tests__/controllers/CommunityReportController_getCommunityFeed.test.js

# Push notification device tokens
npx vitest run __tests__/controllers/NotificationController.test.js

# Single SMS via QuickSend
npx vitest run __tests__/controllers/SmsController.test.js

# Bulk SMS via QuickSend
npx vitest run __tests__/controllers/BulkSmsController.test.js

# Single SMS via Notify.lk
npx vitest run __tests__/controllers/NotifyLkSmsController.test.js

# Bulk SMS via Notify.lk
npx vitest run __tests__/controllers/NotifyLkBulkSmsController.test.js

# Voice call (SOS call)
npx vitest run __tests__/controllers/CallController.test.js

# Safe route (Mapbox integration)
npx vitest run __tests__/controllers/safeRouteController.test.js

# Stripe checkout session
npx vitest run __tests__/controllers/stripeCheckoutController.test.js

# Stripe webhook handler
npx vitest run __tests__/controllers/StripeWebHookHandler.test.js

# PayHere payment + notify endpoint
npx vitest run __tests__/controllers/payhere.controller.test.js

# Stripe payment intent (makePayment)
npx vitest run __tests__/controllers/stripeController.test.js
```

### Services

```bash
# SMS message builders + sendSms
npx vitest run __tests__/services/SmsService.test.js

# Firebase Cloud Messaging (isConfigured, isTokenInvalid, sendFcmMessage)
npx vitest run __tests__/services/firebaseMessagingService.test.js

# Low safety score push notification trigger
npx vitest run __tests__/services/lowSafetyNotificationService.test.js
```

### Middleware

```bash
# JWT auth middleware (no token, wrong scheme, valid token, expired token)
npx vitest run __tests__/middleware/authMiddleware.test.js
```

### Utilities

```bash
# Haversine distance calculation
npx vitest run __tests__/utils/distance.test.js

# Red zone intersection checker
npx vitest run __tests__/utils/zoneChecker.test.js

# Phone number normalization (Sri Lankan formats)
npx vitest run __tests__/utils/normalizeNumberFormat.test.js

# PayHere hash generation
npx vitest run __tests__/utils/payhereHash.test.js

# Geographic circle polygon generator
npx vitest run __tests__/utils/circlePolygon.test.js
```

---

## 5. Run a Specific Group of Tests

```bash
# All CallFeat tests
npx vitest run __tests__/CallFeat

# All controller tests
npx vitest run __tests__/controllers

# All service tests
npx vitest run __tests__/services

# All utility tests
npx vitest run __tests__/utils

# All middleware tests
npx vitest run __tests__/middleware
```

---

## 6. Test Coverage at a Glance

| Area | Test File | Tests |
|------|-----------|-------|
| Notify.lk balance | `CallFeat/notifylkStatus.test.js` | 6 |
| Auth middleware | `middleware/authMiddleware.test.js` | 4 |
| User controller | `controllers/UserController.test.js` | 8 |
| Contact controller | `controllers/ContactController.test.js` | 14 |
| Emergency process | `controllers/EmergencyProcessController.test.js` | 20 |
| Silent call | `controllers/SilentCallController.test.js` | 5 |
| Trip monitoring | `controllers/TripController.test.js` | 14 |
| Community reports | `controllers/CommunityReportController.test.js` | 22 |
| Community feed | `controllers/CommunityReportController_getCommunityFeed.test.js` | 8 |
| Notifications | `controllers/NotificationController.test.js` | 7 |
| SMS (QuickSend) | `controllers/SmsController.test.js` | 5 |
| Bulk SMS (QuickSend) | `controllers/BulkSmsController.test.js` | 4 |
| SMS (Notify.lk) | `controllers/NotifyLkSmsController.test.js` | 5 |
| Bulk SMS (Notify.lk) | `controllers/NotifyLkBulkSmsController.test.js` | 6 |
| Voice call | `controllers/CallController.test.js` | 4 |
| Safe route | `controllers/safeRouteController.test.js` | 7 |
| Stripe checkout | `controllers/stripeCheckoutController.test.js` | 3 |
| Stripe webhook | `controllers/StripeWebHookHandler.test.js` | 6 |
| Stripe payment intent | `controllers/stripeController.test.js` | 3 |
| PayHere | `controllers/payhere.controller.test.js` | 3 |
| SMS service | `services/SmsService.test.js` | 7 |
| Firebase messaging | `services/firebaseMessagingService.test.js` | 9 |
| Low safety notifications | `services/lowSafetyNotificationService.test.js` | 9 |
| Distance utility | `utils/distance.test.js` | 4 |
| Zone checker | `utils/zoneChecker.test.js` | 5 |
| Phone normalization | `utils/normalizeNumberFormat.test.js` | 7 |
| PayHere hash | `utils/payhereHash.test.js` | 5 |
| Circle polygon | `utils/circlePolygon.test.js` | 5 |
| Red zone fetcher | `utils/fetchRedZones.test.js` | 4 |
| **Total** | **29 files** | **230 tests** |

---

## 7. Notes

- **No `.env` file needed** — all external services are mocked with `vi.mock()`. Tests run without any API keys or database connection.
- **No internet connection needed** — zero real network calls are made during tests.
- **Test isolation** — each test clears all mocks in `beforeEach` so tests never affect each other.
- Tests are written using [Vitest](https://vitest.dev/) and follow the ES Module (`"type": "module"`) format used by the rest of the project.
