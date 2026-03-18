# SafePath Public Tracking Integration

## Endpoint

`GET /api/guardian/tracking/:trackingId`

This endpoint is public and intended for emergency contacts who open the shared tracking link.

## Response (200)

```json
{
  "success": true,
  "message": "Trip tracking data fetched",
  "data": {
    "trackingId": "AbC123xYz9",
    "tripName": "Office to Home",
    "status": "ACTIVE",
    "isTrackingActive": true,
    "expectedEndTime": "2026-03-19T15:30:00.000Z",
    "lastKnownLat": 6.9271,
    "lastKnownLng": 79.8612,
    "updatedAt": "2026-03-19T15:02:10.000Z"
  }
}
```

## Errors

### Invalid tracking ID (400)

```json
{
  "success": false,
  "message": "Invalid trackingId"
}
```

### Session not found (404)

```json
{
  "success": false,
  "message": "Trip tracking session not found"
}
```

### Server failure (500)

```json
{
  "success": false,
  "message": "Failed to fetch trip tracking data"
}
```

## Status Meanings

- `ACTIVE`: Trip is ongoing and tracking is still in progress.
- `SAFE`: User ended the trip safely; no further escalation is expected.
- `SOS`: Emergency escalation was triggered (manual or timeout path).

## Flutter Example

```dart
final uri = Uri.parse('$baseUrl/api/guardian/tracking/$trackingId');
final res = await http.get(uri);
if (res.statusCode == 200) {
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  final data = body['data'] as Map<String, dynamic>;
  // Use data['lastKnownLat'], data['lastKnownLng'], data['status']
}
```

## Polling Guidance

- Recommended polling interval: every `10-15` seconds while status is `ACTIVE`.
- If status becomes `SAFE` or `SOS`, stop polling after one final confirmation refresh.
- On HTTP `500`/network failures, use exponential backoff (for example: `5s`, `10s`, `20s`, max `60s`).
- Avoid polling faster than every `5` seconds to reduce unnecessary API load.

## Null Location Handling

- `hasLiveLocation = false` means the backend has not received a valid location update yet.
- In this state, `lastKnownLat`, `lastKnownLng`, and `lastLocationUpdatedAt` can be `null`.
- Frontend should show a placeholder such as `Waiting for first location update` instead of rendering a marker at `0,0`.

## Security Notes

- The endpoint does not return internal IDs like `userId` or `contactIds`.
- Cache headers are disabled so location data remains fresh.
- Status values are controlled by backend enum: `ACTIVE`, `SAFE`, `SOS`.
- Treat `trackingId` as a share token. Do not store it in long-lived analytics logs.
- Do not expose the raw tracking URL in public app screenshots or crash reports.
- Frontend should avoid persisting tracking responses in local disk caches unless encrypted.
