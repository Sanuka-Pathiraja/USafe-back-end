# Flutter Code Changes (Copy-Paste Ready)

## Change 1: Fix Login URL

**File:** `login_screen.dart` (around line 218)

**Change this:**

```dart
final response = await http.post(
  Uri.parse('http://10.0.2.2:5000/login'),  // ❌ WRONG
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({'email': email, 'password': password}),
);
```

**To this:**

```dart
final response = await http.post(
  Uri.parse('http://10.0.2.2:5000/user/login'),  // ✅ CORRECT
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({'email': email, 'password': password}),
);
```

---

## Change 2: Verify Safety Score is Public

**File:** `api_service.dart` (lines 48-51)

**Make sure it looks like this (NO Authorization header):**

```dart
Future<Map<String, dynamic>> fetchGuardianSafetyScore(double lat, double lng) async {
  // ✅ NO Authorization header for safety score
  final response = await http.get(
    Uri.parse('http://10.0.2.2:5000/api/guardian/safety-score?lat=$lat&lng=$lng'),
    headers: {'Content-Type': 'application/json'},
    // NO 'Authorization' header here
  );
  return jsonDecode(response.body);
}
```

---

## Change 3: Verify Protected Endpoints Have Auth

**File:** `api_service.dart` (lines 69-72, 98-101, 127-130)

**Make sure these functions include the token:**

### Save Guardian Route (Protected)

```dart
Future<Map<String, dynamic>> saveGuardianRoute(String name, List<Map> checkpoints) async {
  final token = await AuthService.getToken(); // ✅ Get token

  final response = await http.post(
    Uri.parse('http://10.0.2.2:5000/api/guardian/routes'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token', // ✅ Include token
    },
    body: jsonEncode({
      'name': name,
      'checkpoints': checkpoints,
    }),
  );

  return jsonDecode(response.body);
}
```

### Send Guardian Alert (Protected)

```dart
Future<Map<String, dynamic>> sendGuardianAlert(Map<String, dynamic> alertData) async {
  final token = await AuthService.getToken(); // ✅ Get token

  final response = await http.post(
    Uri.parse('http://10.0.2.2:5000/api/guardian/alert'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token', // ✅ Include token
    },
    body: jsonEncode(alertData),
  );

  return jsonDecode(response.body);
}
```

### Submit Incident Report (Protected - if you have this)

```dart
Future<Map<String, dynamic>> submitIncidentReport(Map<String, dynamic> reportData) async {
  final token = await AuthService.getToken(); // ✅ Get token

  final response = await http.post(
    Uri.parse('http://10.0.2.2:5000/api/incident'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token', // ✅ Include token
    },
    body: jsonEncode(reportData),
  );

  return jsonDecode(response.body);
}
```

---

## ✅ Verification Checklist

After making these changes:

1. **Hot restart your Flutter app** (press R in terminal)
2. **Test login** - Should receive JWT token
3. **Test safety score** - Should work without login
4. **Test save route** - Should work after login (with token)
5. **Test alert** - Should work after login (with token)

---

## 🐛 If You Still Get 401 Errors:

### Debug Steps:

1. **Check if token is being saved:**

   ```dart
   final token = await AuthService.getToken();
   print('Token: $token'); // Should print JWT string
   ```

2. **Check if token is in request:**

   ```dart
   print('Authorization header: Bearer $token');
   ```

3. **Test backend directly:**
   - Backend server running: ✅ (we confirmed this)
   - Test with curl: ✅ (all tests passed)
   - Problem is in Flutter code ❌

4. **Common mistakes:**
   - ❌ Typo in header name: `'Authorisation'` instead of `'Authorization'`
   - ❌ Wrong Bearer format: `'Token $token'` instead of `'Bearer $token'`
   - ❌ Token not retrieved: forgot `await AuthService.getToken()`
   - ❌ Login URL wrong: `/login` instead of `/user/login`

---

## 📞 If Issues Persist:

Share this info:

1. Flutter console error message
2. Backend console logs (when request hits)
3. Code snippet of the failing request

But based on our backend tests - **everything is working correctly on the backend side!** 🎉
