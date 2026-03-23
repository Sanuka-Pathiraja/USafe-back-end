# Community Report Count Integration Guide

Date: 2026-03-08
Base URL: `http://localhost:5000`

## Purpose
Expose the logged-in user's total number of community reports so frontend can show counters/badges.

## Endpoints

### 1) `GET /user/community-report-count` (protected)
Returns only the report count for the authenticated user.

Headers:
- `Authorization: Bearer <jwt_token>`

Success response (`200`):
```json
{
  "success": true,
  "userId": 12,
  "communityReportCount": 5
}
```

Error responses:
- `401` if token is missing/invalid
- `404` if user not found
- `500` for server errors

### 2) `GET /user/get` (protected)
Current user endpoint now also includes `communityReportCount`.

Example response (`200`):
```json
{
  "id": 12,
  "firstName": "Jane",
  "lastName": "Doe",
  "age": 24,
  "phone": "94770000000",
  "email": "jane@example.com",
  "authProvider": "local",
  "communityReportCount": 5
}
```

## Frontend Integration Steps
1. Login user and store JWT from `/user/login` or `/user/googleLogin`.
2. Call `/user/community-report-count` after login/home screen load.
3. Use `communityReportCount` to render badge/counter in profile/dashboard.
4. Refresh count after a successful `POST /report/add` (or optimistically increment by 1 in UI).

## Axios Example
```js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function fetchCommunityReportCount() {
  const { data } = await api.get("/user/community-report-count");
  return data.communityReportCount;
}
```

## Notes
- `communityReportCount` is always a number (`0` if no reports).
- Count is based on records in `community_reports` where `userId = logged-in user id`.
