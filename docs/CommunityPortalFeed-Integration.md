# Community Portal Feed Integration

Date: 2026-03-20
Base URL: `http://localhost:5000`
Module Prefix: `/report`
Auth: Required for all endpoints below (`Authorization: Bearer <jwt_token>`)

## New Endpoints

### 1) Community Feed
`GET /report/feed`

Query params:
- `page` optional, default `1`
- `limit` optional, default `10`, max `50`
- `lat` optional
- `lng` optional
- `radiusKm` optional, used together with `lat` and `lng`
- `issueType` optional

Success response (`200`):
```json
{
  "success": true,
  "page": 1,
  "limit": 10,
  "total": 1,
  "hasMore": false,
  "reports": [
    {
      "reportId": 11,
      "reportContent": "Suspicious activity near park",
      "location": "Colombo 07, Sri Lanka",
      "locationCoordinates": {
        "lat": 6.9147,
        "lng": 79.9733
      },
      "reportDate_time": "2026-03-20T08:40:00.000Z",
      "images_proofs": [
        "https://project.supabase.co/storage/v1/object/public/Report%20Images/reports/example.jpg"
      ],
      "issueTypes": ["Harassment", "Poor Lighting"],
      "likeCount": 4,
      "commentCount": 2,
      "isLikedByCurrentUser": true,
      "user": {
        "userId": 5,
        "name": "Jane Doe",
        "avatarUrl": "http://localhost:5000/uploads/avatar.jpg",
        "username": "jane"
      }
    }
  ]
}
```

### 2) Like a Report
`POST /report/:reportId/like`

Success response (`200`):
```json
{
  "success": true,
  "likeCount": 5,
  "isLikedByCurrentUser": true
}
```

### 3) Unlike a Report
`DELETE /report/:reportId/like`

Success response (`200`):
```json
{
  "success": true,
  "likeCount": 4,
  "isLikedByCurrentUser": false
}
```

### 4) Get Comments
`GET /report/:reportId/comments`

Success response (`200`):
```json
{
  "success": true,
  "total": 2,
  "comments": [
    {
      "commentId": 7,
      "text": "Please stay careful there.",
      "createdAt": "2026-03-20T09:00:00.000Z",
      "user": {
        "userId": 3,
        "name": "John Silva",
        "avatarUrl": null,
        "username": "john"
      }
    }
  ]
}
```

### 5) Add Comment
`POST /report/:reportId/comments`

JSON body:
```json
{
  "text": "Please stay careful there."
}
```

Success response (`201`):
```json
{
  "success": true,
  "comment": {
    "commentId": 8,
    "text": "Please stay careful there.",
    "createdAt": "2026-03-20T09:02:00.000Z",
    "user": {
      "userId": 5,
      "name": "Jane Doe",
      "avatarUrl": "http://localhost:5000/uploads/avatar.jpg",
      "username": "jane"
    }
  }
}
```

## Updated Create Report Support

`POST /report/add` now also accepts optional `issueTypes`.

For `multipart/form-data`, send either:
- `issueTypes` as a JSON string array, for example `["Harassment","Poor Lighting"]`
- or `issueTypes` as a comma-separated string

The create, my-reports, and report-details responses now include:
- `issueTypes`
- normalized absolute `images_proofs` URLs

## Required Database Change

Run the new migration before using these APIs:
- `src/migrations/1774700000000-AddCommunityFeedSocialFeatures.ts`
