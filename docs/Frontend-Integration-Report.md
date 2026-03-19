# Frontend Integration Report (Payment, Login, Contact, Community Reports)

Date: 2026-03-07  
Scope: Backend APIs and database mappings required for frontend integration in this repository.

## 1) Integration Summary

- Login: Implemented (email/password + Google login), JWT-based auth for protected routes.
- Payment: Stripe Checkout endpoint implemented and protected by JWT; webhook persists payment records.
- Contact: Full authenticated CRUD implemented for user-owned contacts.
- Community Reports: Authenticated create endpoint implemented with multipart image upload and DB persistence.
- Database: TypeORM entities and migrations exist for `users`, `contacts`, `community_reports`, and `payments`.

## 2) Base API and Auth Contract

- Base URL (local): `http://localhost:5000`
- Auth header for protected routes:
  - `Authorization: Bearer <jwt_token>`
- JWT is issued from:
  - `POST /user/login`
  - `POST /user/googleLogin`

## 3) Login Integration

### Endpoints

- `POST /user/add` (register)
- `POST /user/login` (email/password login)
- `POST /user/googleLogin` (Google ID token login)
- `GET /user/get` (current user, protected)
- `PUT /user/update` (protected)
- `DELETE /user/delete` (protected)

### Frontend Notes

- Persist returned JWT securely and attach it to all protected calls.
- On 401 responses, force re-login (middleware returns `"Invalid or expired token. Please re-login."`).

## 4) Payment Integration (Stripe)

### Endpoints

- `POST /payment/checkout` (protected)
  - Body: `{ "amount": <number> }`
  - Response: `{ "checkoutUrl": "<stripe-hosted-url>" }`
- `POST /webhook/stripe` (server-to-server webhook)

### Current Flow

1. Frontend sends amount to `/payment/checkout` with JWT.
2. Backend creates Stripe Checkout session with `metadata.user_id = req.user.id`.
3. Frontend redirects user to returned `checkoutUrl`.
4. Stripe webhook inserts payment row into `payments` table via Supabase client.

### Frontend Notes

- `success_url` and `cancel_url` are currently hardcoded to `http://10.0.2.2:5000/...` in backend; this should be changed per target client environment.
- No dedicated frontend-facing API exists yet to fetch a user’s payment history.

## 5) Contact Integration

### Endpoints (all protected)

- `GET /contact/contacts`
- `POST /contact/contacts`
- `PUT /contact/contacts/:contactId`
- `DELETE /contact/contacts/:contactId`

### Request/Response Shape

- Create body requires: `name`, `phone`, `relationship`.
- Duplicate phone is prevented per user.
- DTO returned:
  - `contactId`, `name`, `relationship`, `phone`

## 6) Community Reports Integration

### Endpoint

- `POST /report/add` (protected, multipart/form-data)

### Required/Supported Inputs

- Text fields:
  - `reportContent`
  - `reportDate_time` (optional; DB default exists)
- Files:
  - `images_proofs` (multiple files supported)

### Flow

1. Backend uploads each file to Supabase Storage bucket `Report Images`.
2. Public URLs are collected into `images_proofs` array.
3. Report is saved in `community_reports` with authenticated `userId`.

## 7) Database Coverage

### `users`

- Core fields: `id`, `firstName`, `lastName`, `age`, `phone`, `email`, `password`, `authProvider`
- Relation: one-to-many with `contacts`, one-to-many with `communityReports`

### `contacts`

- Core fields: `contactId`, `name`, `relationship`, `phone`, `userId`
- Relation: many-to-one to `users` (`ON DELETE CASCADE`)

### `community_reports`

- Core fields: `reportId`, `reportContent`, `reportDate_time`, `images_proofs[]`, `location`, `userId`
- Relation: many-to-one to `users` (`ON DELETE CASCADE`)

### `payments`

- Core fields: `id`, `amount`, `currency`, `stripe_id` (unique), `status`, `created_at`, `user_id`
- Relation: many-to-one to `users` (`ON DELETE CASCADE`)

## 8) Gaps / Risks to Address

- `PayHereRouter` exists but is not mounted in `index.js` and import path casing suggests mismatch (`controllers` vs `Controller`), so PayHere is not active.
- Webhook in development mode skips Stripe signature verification (acceptable for local testing only).
- No validation layer for request payloads (frontend should still validate before submit, but backend validation should be added).
- API response format is not fully uniform across modules.

## 9) Frontend Checklist

- Implement JWT storage + automatic `Authorization` header injection.
- Implement login + Google login handling and 401 session reset.
- For payments, call `/payment/checkout` then redirect to `checkoutUrl`.
- Submit community reports as `multipart/form-data` with `images_proofs` array field.
- Use contact CRUD routes with optimistic UI + duplicate-phone error handling.
- Align backend environment URLs for Stripe success/cancel return to real app routes before release.

## 10) SafePath Navigation Integration

### Endpoint

- `POST /safe-route` (recommended)
- `GET /safe-route` (supported, but less convenient for structured arrays)

### Purpose

This endpoint calculates a route between a start point and an end point, checks whether that route intersects danger zones, and attempts to return a safer alternative when possible.

### Required Inputs

The frontend must send:

- `startLat`
- `startLon`
- `endLat`
- `endLon`
- `redZones`

### `redZones` Shape

Each entry in `redZones` must contain:

- `lat`
- `lon`
- `radius`

`radius` is in meters.

### Example Request Body

```json
{
  "startLat": 6.8391,
  "startLon": 79.8817,
  "endLat": 6.8425,
  "endLon": 79.8846,
  "redZones": [
    {
      "lat": 6.8398,
      "lon": 79.8847,
      "radius": 50
    }
  ]
}
```

### Response Shape

The backend returns:

- `success`
- `start`
- `end`
- `redZones`
- `originalRoute`
- `safeRoute`
- `totalRoutesChecked`
- `message`

### Important Response Fields

#### `originalRoute`

Always present when routing succeeds.

Contains:

- `path`
- `distance`
- `duration`
- `isDangerous`
- `color`

#### `safeRoute`

- contains an alternative route if one is found
- returns `null` if no alternative is available or if the original route is already safe

#### `redZones`

The backend returns danger zones in a frontend-friendly structure including polygon points that can be drawn directly on a map.

### Example Success Cases

#### Original route is safe

- `originalRoute.isDangerous = false`
- `safeRoute = null`
- `message = "Original route is safe"`

#### Safe alternative route found

- `originalRoute.isDangerous = true`
- `safeRoute` contains route data
- `message = "Safe alternative route found"`

#### No safe alternative route found

- `originalRoute.isDangerous = true`
- `safeRoute = null`
- `message = "No safe alternative route available. Original route passes through danger zone."`

### Frontend Rendering Guidance

- Always draw `originalRoute.path`
- If `safeRoute` exists, draw it as the recommended path
- Use `originalRoute.isDangerous` to decide whether to warn the user
- Draw danger zones using `redZones[].polygon`
- Use `message` directly for user-facing route status text if needed

### Error Cases

#### Missing Mapbox token

```json
{
  "success": false,
  "message": "MAPBOX_TOKEN is not configured"
}
```

#### Missing coordinates

```json
{
  "success": false,
  "message": "startLat/startLon and endLat/endLon are required and must be valid coordinates"
}
```

#### Missing danger zones

```json
{
  "success": false,
  "message": "redZones must contain at least one valid zone with lat, lon, and radius"
}
```

#### No route found

```json
{
  "success": false,
  "error": "No routes found"
}
```

### Environment Requirement

The backend requires:

- `MAPBOX_TOKEN`

Without this, SafePath Navigation will not work.
