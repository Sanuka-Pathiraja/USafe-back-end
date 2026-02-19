# Messaging and Emergency Process Postman Guide

## Prerequisites
- Run backend: `npm start`
- Keep `.env` flags as:
  - `DISABLE_SMS=false`
  - `DISABLE_BULK_SMS=false`
- Use a valid JWT in header for emergency process routes:
  - `Authorization: Bearer <token>`

## 1) QuickSend single SMS
- Method: `POST`
- URL: `http://localhost:5000/sms`
- Body (JSON):
```json
{
  "to": "9477XXXXXXX",
  "msg": "SafeZone single SMS test",
  "senderID": "QKSendDemo"
}
```
- Expected logs:
  - `SMS_SEND_REQUEST`
  - `SMS_SEND_SUCCESS` or `SMS_SEND_FAILED`

## 2) QuickSend bulk SMS
- Method: `POST`
- URL: `http://localhost:5000/bulk-sms`
- Body (JSON):
```json
{
  "to": ["9477XXXXXXX", "9476XXXXXXX"],
  "msg": "SafeZone bulk SMS test",
  "senderID": "QKSendDemo"
}
```
- Expected logs:
  - `BULK_SMS_SEND_REQUEST`
  - `BULK_SMS_SEND_SUCCESS` or `BULK_SMS_SEND_FAILED`

## 3) Notify.lk bulk SMS
- Method: `POST`
- URL: `http://localhost:5000/sms/notify/bulk`
- Body (JSON):
```json
{
  "message": "Notify.lk bulk test",
  "unicode": false,
  "concurrency": 3,
  "recipients": [
    { "to": "9477XXXXXXX", "fname": "Test1" },
    { "to": "9476XXXXXXX", "fname": "Test2" }
  ]
}
```
- Expected logs:
  - `NOTIFY_BULK_REQUEST`
  - `NOTIFY_BULK_RESULT` or `NOTIFY_BULK_FAILED`

## 4) Emergency start (Notify.lk messaging + call flow)
- Method: `POST`
- URL: `http://localhost:5000/emergency/start`
- Headers:
  - `Authorization: Bearer <token>`
- Body (JSON):
```json
{
  "locationText": "Colombo Fort",
  "dangerTime": "2026-02-19T10:30:00+05:30",
  "message": "",
  "messageMode": "exact",
  "useDefaultTemplate": true,
  "unicode": false
}
```
- Notes:
  - If `message` is empty, backend sends full default template with location/time.
  - If `message` is provided, backend appends location/time by default.
  - To send exact custom text only, set `messageMode: "exact"` OR `useDefaultTemplate: false`.
- Expected logs:
  - `EMERGENCY_PROCESS_START`
  - `EMERGENCY_PROCESS_RESULT` or `EMERGENCY_PROCESS_FAILED`
- Response includes `sessionId`

## 5) Check emergency status
- Method: `GET`
- URL: `http://localhost:5000/emergency/<sessionId>/status`
- Headers:
  - `Authorization: Bearer <token>`

## Log verification checklist
- Confirm masked recipient numbers appear in logs.
- Confirm `sent`, `failed`, and `total` fields match Postman response.
- If provider fails, check API credential env vars and error in `*_FAILED` log event.
