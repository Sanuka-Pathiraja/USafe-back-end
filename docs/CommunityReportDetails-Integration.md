# Community Report Details Frontend Integration

Date: 2026-03-08
Base URL: `http://localhost:5000`
Module Prefix: `/report`
Auth: Required for all endpoints below (`Authorization: Bearer <jwt_token>`)

## Overview
This backend now supports both creating community reports and fetching report details for the logged-in user.

The location payload is now split into two parts:

- `location`: exact human-readable address or selected place text
- `locationCoordinates`: exact coordinates for that selected place

## Endpoints

### 1) Create Report
`POST /report/add`

Content type:
- `multipart/form-data`

Form fields:
- `reportContent` (string, required)
- `reportDate_time` (string, optional, ISO format recommended)
- `location` (string, optional)
- `locationCoordinates` (JSON string, optional)
- `images_proofs` (file[], optional, multiple supported)

Recommended payload shape from frontend:

- `location`: `"Colombo 07, Sri Lanka"`
- `locationCoordinates`: `{"lat":6.9147,"lng":79.9733}`

Because this endpoint uses `multipart/form-data`, send `locationCoordinates` as a JSON string.

Example form values:

- `location = Colombo 07, Sri Lanka`
- `locationCoordinates = {"lat":6.9147,"lng":79.9733}`

Backend compatibility:

- preferred: `locationCoordinates` as JSON string
- also supported: `latitude` + `longitude`
- also supported: `locationLat` + `locationLng`

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
    "location": "Colombo 07, Sri Lanka",
    "locationCoordinates": {
      "lat": 6.9147,
      "lng": 79.9733
    },
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
      "location": "Colombo 07, Sri Lanka",
      "locationCoordinates": {
        "lat": 6.9147,
        "lng": 79.9733
      },
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
    "location": "Colombo 07, Sri Lanka",
    "locationCoordinates": {
      "lat": 6.9147,
      "lng": 79.9733
    },
    "userId": 5
  }
}
```

Error responses:
- `400` invalid `locationCoordinates` payload
- `400` invalid `reportId`
- `401` missing/invalid JWT
- `404` report not found (or not owned by logged-in user)
- `500` server error

## Frontend Flow
1. After login, store JWT.
2. When user selects a place, capture both:
   - exact display address
   - exact coordinates
3. Create a report from form using `multipart/form-data`.
4. Send:
   - `location` as the exact selected address
   - `locationCoordinates` as a JSON string with `lat` and `lng`
5. Load report list with `/report/my-reports` for history screen.
6. Open details page using `/report/:reportId`.
7. After creating a report, refresh list and user report count endpoints.

## Frontend Integration Requirement

When the user picks a location from autocomplete, search, or a map selector, the frontend must save both values from the same selected place:

- Address column value:
  store the exact address text in `location`

- Coordinates column value:
  store the selected place coordinates in `locationCoordinates`

Do not send only the address if exact coordinates are available.  
The backend now supports storing them separately, and the safety logic works better when true coordinates are stored directly.

## Example Frontend Submit Logic

```js
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:5000" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function createCommunityReport({
  reportContent,
  reportDateTime,
  selectedPlace,
  files = [],
}) {
  const formData = new FormData();
  formData.append("reportContent", reportContent);

  if (reportDateTime) {
    formData.append("reportDate_time", reportDateTime);
  }

  if (selectedPlace?.address) {
    formData.append("location", selectedPlace.address);
  }

  if (
    typeof selectedPlace?.lat === "number" &&
    typeof selectedPlace?.lng === "number"
  ) {
    formData.append(
      "locationCoordinates",
      JSON.stringify({
        lat: selectedPlace.lat,
        lng: selectedPlace.lng,
      })
    );
  }

  for (const file of files) {
    formData.append("images_proofs", file);
  }

  const { data } = await api.post("/report/add", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data.report;
}
```

## Read APIs

The list and detail APIs now return both:

- `location`
- `locationCoordinates`

This means frontend can display the saved address and also use coordinates later for maps, pins, routing, or analytics.

## Simple Fetch Helpers

```js
export async function getMyReports() {
  const { data } = await api.get("/report/my-reports");
  return data.reports;
}

export async function getReportDetails(reportId) {
  const { data } = await api.get(`/report/${reportId}`);
  return data.report;
}
```
