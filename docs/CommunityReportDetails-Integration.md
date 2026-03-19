# Community Report Details Frontend Integration

Date: 2026-03-08
Base URL: `http://localhost:5000`
Module Prefix: `/report`
Auth: Required for all endpoints below (`Authorization: Bearer <jwt_token>`)

## Overview
This backend now supports both creating community reports and fetching report details for the logged-in user.

## Endpoints

### 1) Create Report
`POST /report/add`

Content type:
- `multipart/form-data`

Form fields:
- `reportContent` (string, required)
- `reportDate_time` (string, optional, ISO format recommended)
- `location` (string, optional)
- `images_proofs` (file[], optional, multiple supported)

Success response (`201`):
```json
{
  "success": true,
  "message": "report saved successfully",
  "report": {
    "reportId": 11,
    "reportContent": "Suspicious activity near park",
    "reportDate_time": "2026-03-08T08:40:00.000Z",
    "images_proofs": ["https://..."],
    "location": "Colombo 07",
    "userId": 5
  }
}
```

### 2) Get My Reports (List)
`GET /report/my-reports`

Success response (`200`):
```json
{
  "success": true,
  "total": 2,
  "reports": [
    {
      "reportId": 11,
      "reportContent": "Suspicious activity near park",
      "reportDate_time": "2026-03-08T08:40:00.000Z",
      "images_proofs": ["https://..."],
      "location": "Colombo 07",
      "userId": 5
    }
  ]
}
```

### 3) Get Single Report Details
`GET /report/:reportId`

Example:
- `GET /report/11`

Success response (`200`):
```json
{
  "success": true,
  "report": {
    "reportId": 11,
    "reportContent": "Suspicious activity near park",
    "reportDate_time": "2026-03-08T08:40:00.000Z",
    "images_proofs": ["https://..."],
    "location": "Colombo 07",
    "userId": 5
  }
}
```

Error responses:
- `400` invalid `reportId`
- `401` missing/invalid JWT
- `404` report not found (or not owned by logged-in user)
- `500` server error

## Frontend Flow
1. After login, store JWT.
2. Create a report from form using `multipart/form-data`.
3. Load report list with `/report/my-reports` for history screen.
4. Open details page using `/report/:reportId`.
5. After creating a report, refresh list and user report count endpoints.

## Axios Example
```js
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:5000" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function getMyReports() {
  const { data } = await api.get("/report/my-reports");
  return data.reports;
}

export async function getReportDetails(reportId) {
  const { data } = await api.get(`/report/${reportId}`);
  return data.report;
}
```
