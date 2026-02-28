# Flutter Integration Guide

## ✅ Backend Status: FULLY READY

All JWT authentication and protected endpoints are implemented and tested.

---

## 🔧 Required Flutter Changes

### 1. **Update Login Endpoint URL**

**Current (Wrong):**

```dart
POST http://10.0.2.2:5000/login
```

**Correct:**

```dart
POST http://10.0.2.2:5000/user/login
```

**Location:** `login_screen.dart:218`

---

### 2. **Complete Endpoint Reference**

| Feature          | Method | Endpoint                                 | Auth Required | Response                   |
| ---------------- | ------ | ---------------------------------------- | ------------- | -------------------------- |
| **Login**        | POST   | `/user/login`                            | ❌ No         | `{ token, user, success }` |
| **Register**     | POST   | `/user/add`                              | ❌ No         | `{ user, success }`        |
| **Safety Score** | GET    | `/api/guardian/safety-score?lat=X&lng=Y` | ❌ No         | `{ score, status }`        |
| **Save Route**   | POST   | `/api/guardian/routes`                   | ✅ Yes        | `{ route, success }`       |
| **List Routes**  | GET    | `/api/guardian/routes`                   | ✅ Yes        | `{ routes, success }`      |
| **Send Alert**   | POST   | `/api/guardian/alert`                    | ✅ Yes        | `{ success }`              |

---

## 🔑 Authentication Flow

### Login Request

```dart
final response = await http.post(
  Uri.parse('http://10.0.2.2:5000/user/login'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'email': email,
    'password': password,
  }),
);

// Response format:
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 11,
    "email": "test@usafe.com",
    "firstName": "Test",
    "lastName": "User"
  }
}
```

### Store Token

```dart
// After successful login:
await AuthService.saveToken(data['token']);
```

### Use Token in Protected Requests

```dart
final token = await AuthService.getToken();

final response = await http.post(
  Uri.parse('http://10.0.2.2:5000/api/guardian/routes'),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token', // ✅ Required for protected endpoints
  },
  body: jsonEncode({
    'name': 'School Route',
    'checkpoints': [
      {'name': 'Home', 'lat': 6.9271, 'lng': 79.8612},
      {'name': 'School', 'lat': 6.9456, 'lng': 79.8627}
    ]
  }),
);
```

---

## 🧪 Testing Checklist

### Before Testing in Flutter:

1. **Start Backend Server**

   ```bash
   npm start
   ```

2. **Verify Server Health**

   ```bash
   curl http://localhost:5000/health
   ```

3. **Run Integration Test**
   ```bash
   node test-frontend-integration.js
   ```
   Should show: ✅ ALL TESTS PASSED

---

### In Flutter App:

1. **Test Login**
   - Try login with credentials
   - Verify JWT token is returned
   - Check token is saved to storage

2. **Test Safety Score (No Auth)**
   - Should work WITHOUT logging in
   - Returns score 0-100

3. **Test Save Route (Auth Required)**
   - Must be logged in
   - Should return 401 if no token
   - Should succeed with valid token

4. **Test Send Alert (Auth Required)**
   - Must be logged in
   - Should trigger SMS (if configured)

---

## 🐛 Common Issues & Solutions

### Issue 1: "Failed to save route: Exception: Route save failed (401)"

**Cause:** Missing or invalid JWT token  
**Solution:**

- Verify user is logged in
- Check token is being retrieved: `await AuthService.getToken()`
- Ensure Authorization header is set: `'Authorization': 'Bearer $token'`

### Issue 2: "Failed to fetch safety score: Exception: Guardian score request failed (401)"

**Cause:** Safety score endpoint had auth (we fixed this in backend!)  
**Solution:**

- Remove Authorization header from safety score request
- This endpoint is now PUBLIC (no auth needed)

### Issue 3: Login returns 401 "Invalid email or password"

**Cause:** User doesn't exist or wrong password  
**Solution:**

- Register user first: POST `/user/add`
- Or create test user in database

### Issue 4: Server unreachable from Android emulator

**Cause:** Using wrong URL  
**Solution:**

- ✅ Use `http://10.0.2.2:5000` (Android emulator)
- ❌ Do NOT use `http://localhost:5000` (won't work in emulator)

---

## 📋 Quick Reference: Request Examples

### 1. Login

```dart
POST /user/login
Body: {
  "email": "test@usafe.com",
  "password": "Test123!"
}
// No auth header needed
```

### 2. Get Safety Score (Public)

```dart
GET /api/guardian/safety-score?lat=6.9271&lng=79.8612
// No auth header needed
```

### 3. Save Guardian Route (Protected)

```dart
POST /api/guardian/routes
Headers: {
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
Body: {
  "name": "School Route",
  "checkpoints": [
    {"name": "Home", "lat": 6.9271, "lng": 79.8612},
    {"name": "School", "lat": 6.9456, "lng": 79.8627}
  ]
}
```

### 4. Send Alert (Protected)

```dart
POST /api/guardian/alert
Headers: {
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
Body: {
  "routeName": "School Route",
  "checkpointName": "School",
  "status": "arrived",
  "lat": 6.9456,
  "lng": 79.8627,
  "parentPhone": "+94771234567"
}
```

---

## ✅ Backend Implementation Summary

Everything you mentioned in your frontend checklist is **ALREADY DONE**:

- ✅ JWT generation in `/user/login` endpoint
- ✅ JWT verification middleware (`authMiddleware.js`)
- ✅ Protected endpoints: `/api/guardian/routes`, `/api/guardian/alert`
- ✅ Public endpoint: `/api/guardian/safety-score` (no auth required)
- ✅ Proper 401 responses when token missing/invalid
- ✅ Token expiry handling (configurable via JWT_EXPIRES_IN)

---

## 🚀 Next Steps

1. Update Flutter login URL to `/user/login` (add `/user` prefix)
2. Verify safety score request does NOT send Authorization header
3. Test in Android emulator - all features should work
4. Ready for tomorrow's pitch! 🎉
