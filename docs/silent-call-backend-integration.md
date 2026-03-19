# Silent Call Backend Integration

## Feature Name

Silent Call

## Description

The frontend now includes a global `Silent Call` action on the Emergency Contacts screen.

This feature is intended for situations where the user cannot speak during an emergency.

The user can:

1. open the Silent Call panel
2. type or edit an emergency message
3. select multiple saved emergency contacts
4. submit the request to the backend

The frontend does not perform automated calling itself.

The backend is expected to receive the message and selected contacts, then trigger the automated emergency calling workflow.

## API Endpoint Used

Primary endpoint expected by frontend:

`POST /emergency/silent-call`

Fallback endpoints also attempted by frontend:

1. `POST /contact/silent-call`
2. `POST /emergency/contacts/silent-call`

Recommended backend implementation:

`POST /emergency/silent-call`

## HTTP Method

`POST`

## Headers

```http
Authorization: Bearer <jwt>
Content-Type: application/json
```

## Exact JSON Payload Sent

```json
{
  "message": "This is an emergency. I cannot speak right now. Please help me immediately.",
  "contacts": [
    {
      "contactId": "123",
      "name": "John",
      "phone": "+94771234567"
    },
    {
      "contactId": "456",
      "name": "Sarah",
      "phone": "+94774567890"
    }
  ]
}
```

## Expected Success Response

The frontend reads `message` from the response and shows it to the user.

Recommended success response:

```json
{
  "success": true,
  "message": "Silent Call request submitted successfully.",
  "requestId": "optional-request-id",
  "queuedCalls": 2
}
```

## Expected Error Response

The frontend reads `message` from the response and shows it directly.

Recommended error response shape:

```json
{
  "success": false,
  "message": "Failed to process Silent Call request."
}
```

Recommended status codes:

1. `400` for validation errors
2. `401` for invalid or expired auth
3. `404` if the route is not available
4. `422` for backend validation failures
5. `500` or `502` for server/provider failures

## Backend Notes

The backend should:

1. authenticate the user via JWT
2. validate that `message` is not empty
3. validate that `contacts` is a non-empty array
4. validate that each selected contact belongs to the authenticated user if `contactId` is provided
5. normalize and validate phone numbers
6. trigger automated emergency calls using the provided message and contact list
7. return a clear JSON response with a user-friendly `message`

## Suggested Backend Instruction

```txt
Implement POST /emergency/silent-call with JWT authentication.
Accept a JSON body containing message and contacts[].
Validate the payload, verify contact ownership, normalize phone numbers, and trigger the backend's automated emergency call workflow using the message and selected contacts.
Return JSON with success/message and optional requestId/queuedCalls fields.
Use clear error responses with a message field so the frontend can display them directly.
```
