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

## Change 2: Parse New Safety Score Fields (Null Safe)

**File:** `api_service.dart`

### 2A) Add a model for the enriched response

```dart
class SafetyScoreData {
  final int score;
  final double latitude;
  final double longitude;
  final String status;
  final double? closestHospitalKm;
  final double? closestPoliceStationKm;
  final int? populationDensityPerKm2;
  final String? trafficLevel;
  final String? timeOfDay;

  SafetyScoreData({
    required this.score,
    required this.latitude,
    required this.longitude,
    required this.status,
    required this.closestHospitalKm,
    required this.closestPoliceStationKm,
    required this.populationDensityPerKm2,
    required this.trafficLevel,
    required this.timeOfDay,
  });

  static double? _toDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  static int? _toInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is num) return value.round();
    return int.tryParse(value.toString());
  }

  factory SafetyScoreData.fromJson(Map<String, dynamic> json) {
    return SafetyScoreData(
      score: _toInt(json['score']) ?? 0,
      latitude: _toDouble(json['latitude']) ?? 0,
      longitude: _toDouble(json['longitude']) ?? 0,
      status: (json['status'] ?? 'unknown').toString(),
      closestHospitalKm: _toDouble(json['closestHospitalKm'] ?? json['closest_hospital_km']),
      closestPoliceStationKm:
          _toDouble(json['closestPoliceStationKm'] ?? json['closest_police_station_km']),
      populationDensityPerKm2:
          _toInt(json['populationDensityPerKm2'] ?? json['population_density_per_km2']),
      trafficLevel: (json['trafficLevel'] ?? json['traffic_level'])?.toString(),
      timeOfDay: (json['timeOfDay'] ?? json['time_of_day'])?.toString(),
    );
  }
}
```

### 2B) Update safety score API method

```dart
Future<SafetyScoreData> fetchGuardianSafetyScore(double lat, double lng) async {
  final response = await http.post(
    Uri.parse('http://10.0.2.2:5000/safety-score'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'location': {'lat': lat, 'lng': lng}
    }),
  );

  final body = jsonDecode(response.body);
  if (response.statusCode != 200) {
    throw Exception('Safety score request failed (${response.statusCode}): $body');
  }

  return SafetyScoreData.fromJson(body as Map<String, dynamic>);
}
```

Notes:

- Keep this endpoint public (no Authorization header).
- Backend supports both camelCase and snake_case keys, and this parser handles both.

---

## Change 3: Handle Nulls Gracefully in UI

**File:** `safety_score_screen.dart`

Add null-safe formatters:

```dart
String _formatDistanceKm(double? km) {
  if (km == null) return 'N/A';
  if (km < 1) return '${(km * 1000).round()} m';
  return '${km.toStringAsFixed(2)} km';
}

String _formatPopulationDensity(int? value) {
  if (value == null) return 'N/A';
  return '$value ppl/km²';
}

String _safeText(String? value) {
  if (value == null || value.trim().isEmpty) return 'N/A';
  return value;
}
```

---

## Change 4: Inject Parsed Values into Safety Cards

**File:** `safety_score_screen.dart`

### 4A) Keep state using the new model

```dart
SafetyScoreData? _safetyData;
bool _isLoading = true;
String? _error;

Future<void> _loadSafetyScore(double lat, double lng) async {
  setState(() {
    _isLoading = true;
    _error = null;
  });

  try {
    final data = await ApiService().fetchGuardianSafetyScore(lat, lng);
    setState(() {
      _safetyData = data;
      _isLoading = false;
    });
  } catch (e) {
    setState(() {
      _error = e.toString();
      _isLoading = false;
    });
  }
}
```

### 4B) Bind card values directly

```dart
InfoCard(
  title: 'Closest Hospital',
  value: _isLoading
      ? 'Calculating...'
      : _formatDistanceKm(_safetyData?.closestHospitalKm),
  subtitle: 'Distance to nearest hospital',
),

InfoCard(
  title: 'Closest Police Station',
  value: _isLoading
      ? 'Calculating...'
      : _formatDistanceKm(_safetyData?.closestPoliceStationKm),
  subtitle: 'Distance to nearest police station',
),

InfoCard(
  title: 'Time of Day',
  value: _isLoading ? 'Calculating...' : _safeText(_safetyData?.timeOfDay),
  subtitle: 'Current day period used by risk model',
),

InfoCard(
  title: 'Population Density',
  value: _isLoading
      ? 'Calculating...'
      : _formatPopulationDensity(_safetyData?.populationDensityPerKm2),
  subtitle: 'People per square kilometer in your area',
),

InfoCard(
  title: 'Traffic Level',
  value: _isLoading ? 'Calculating...' : _safeText(_safetyData?.trafficLevel),
  subtitle: 'Current traffic congestion status',
),
```

---

## Change 5: Verify Protected Endpoints Have Auth

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
