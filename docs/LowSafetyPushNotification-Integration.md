# Low Safety Score Push Notification Integration

Date: 2026-03-19
Base URL: `http://localhost:5000`
Auth: Required for device-token endpoints with `Authorization: Bearer <jwt_token>`
Delivery: Firebase Cloud Messaging (FCM)

## Implemented Backend Endpoints

### Register device token
`POST /notification/device-token`

Content type:
- `application/json`

Request body:
```json
{
  "token": "<fcm_device_token>",
  "platform": "android",
  "deviceName": "Pixel 7"
}
```

Success response:
```json
{
  "success": true,
  "message": "Device token registered successfully."
}
```

Validation notes:
- `token` is required
- `platform` must be `android`, `ios`, or `web`
- existing tokens are upserted instead of duplicated
- the token is always associated to the authenticated user

### Remove device token
`DELETE /notification/device-token`

Content type:
- `application/json`

Request body:
```json
{
  "token": "<fcm_device_token>"
}
```

Success response:
```json
{
  "success": true,
  "message": "Device token removed successfully."
}
```

## Low Score Trigger

The backend low-score push trigger is currently wired into the existing authenticated safety score calculation flow:

- `POST /report/live-safety-score`
- `GET /report/live-safety-score`
- `POST /safety-score`
- `GET /safety-score`

When the latest computed score is below `40`, the backend will:

- check the cooldown window
- load all active tokens for the authenticated user
- send a real FCM push notification
- log each delivery attempt
- disable invalid or unregistered tokens automatically

Notification payload:

- title: `Safety Score Is Low`
- body: `Your safety score dropped below 40. Activate Emergency now.`
- data:
  - `type=low_safety_score`
  - `score=<current score>`
  - `threshold=40`
  - `click_action=FLUTTER_NOTIFICATION_CLICK`

Cooldown:

- default is `20` minutes
- override with `LOW_SAFETY_NOTIFICATION_COOLDOWN_MINUTES`

## Required Environment Variables

Add these for FCM HTTP v1 delivery:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
LOW_SAFETY_NOTIFICATION_COOLDOWN_MINUTES=20
```

Notes:

- `FIREBASE_PRIVATE_KEY` should preserve newline characters as escaped `\n`
- if Firebase env vars are missing, the backend will skip push delivery and log the skipped attempt

## Database Changes

New migration:

- `src/migrations/1773800000000-CreatePushNotificationTables.ts`

New tables:

- `notification_device_tokens`
- `push_notification_logs`

## Frontend Routing Contract

The notification `data.type` value is `low_safety_score`.

Use that value on notification tap to open the app and route the user into the emergency or safety flow.
