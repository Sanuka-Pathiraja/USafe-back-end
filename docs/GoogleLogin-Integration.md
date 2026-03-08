# Google Login Integration (Avatar, Phone, Birthday + Debug Checklist)

Date: 2026-03-08
Endpoint: `POST /user/googleLogin`
Base URL: `http://localhost:5000`

## Backend Status
Backend now:
- verifies Google `idToken`
- optionally uses Google `accessToken` to call People API
- returns `avatar`, `phone`, `birthday` in login response
- persists `avatar` and `birthday` in `users` table (after migration)
- can return temporary debug block for troubleshooting

## Request Contract
```json
{
  "idToken": "<google_id_token>",
  "accessToken": "<google_access_token_optional>",
  "debug": true
}
```

Notes:
- `idToken` is required.
- `accessToken` is required for reliable `birthday` and Google `phone`.
- `debug` is optional. In non-production, it adds a `debug` object in response.

## Success Response (`200`)
```json
{
  "success": true,
  "message": "Google login successful",
  "token": "<safezone_jwt>",
  "user": {
    "id": 5,
    "email": "user@gmail.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+94771234567",
    "avatar": "https://lh3.googleusercontent.com/...",
    "birthday": "1999-04-18"
  },
  "debug": {
    "hasAccessToken": true,
    "peopleApiStatus": 200,
    "birthdayFound": true,
    "phoneFound": true,
    "peopleApiError": null
  }
}
```

If `accessToken` is missing:
- login still succeeds
- message includes warning about missing access token
- `birthday`/`phone` may be null

## Birthday Format
- `YYYY-MM-DD` when year is provided
- `MM-DD` when year is hidden by Google
- `null` if unavailable

## Required Frontend Scopes
- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/user.birthday.read`
- `https://www.googleapis.com/auth/user.phonenumbers.read`

## Frontend Steps
1. Get `idToken` and `accessToken` from Google sign-in.
2. Call `POST /user/googleLogin` with both tokens.
3. Save backend JWT from `token`.
4. Render UI from `user.avatar`, `user.phone`, `user.birthday`.
5. For troubleshooting use `debug: true` or `?debug=1`.

## Error Responses
- `400` `Google token is required`
- `400` `Google account email is required`
- `401` `Google email is not verified`
- `401` `Invalid Google token`
- `500` `GOOGLE_CLIENT_ID is not configured`
- `500` `JWT_SECRET is not configured`

## Backend Checklist (for missing phone/birthday)
1. Confirm request body includes non-empty `accessToken`.
2. Confirm `.env` `GOOGLE_CLIENT_ID` matches frontend Web Client ID.
3. Enable Google People API in the same Google project.
4. Confirm frontend granted birthday/phone scopes.
5. Check backend logs:
   - `GOOGLE_LOGIN_REQUEST`
   - `GOOGLE_LOGIN_VERIFIED`
   - `GOOGLE_LOGIN_PROFILE_RESULT`
6. If login returns values but profile screen later misses them, run user migration and confirm `/user/get` response.

## Migration Required
Run migration to add fields in `users`:
- `avatar`
- `birthday`

Command:
```bash
npm run migration:run
```
