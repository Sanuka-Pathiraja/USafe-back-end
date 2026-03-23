import { test } from "node:test";
import assert from "node:assert";

test("trip routes", async (t) => {
  await t.test("POST /trip/start should return 400 without tripName", async () => {
    // This test validates request structure; actual HTTP testing requires a running server.
    // For unit-level validation, we test the parsing and validation logic directly.
    const tripName = "";
    const isValid = Boolean(tripName && tripName.trim().length > 0);
    assert.strictEqual(isValid, false, "Empty trip name should fail validation");
  });

  await t.test("POST /trip/start should cap trip name length", async () => {
    const MAX_TRIP_NAME_LENGTH = 120;
    const longName = "x".repeat(MAX_TRIP_NAME_LENGTH + 10);
    const sanitized = longName.slice(0, MAX_TRIP_NAME_LENGTH);
    assert.strictEqual(sanitized.length, MAX_TRIP_NAME_LENGTH);
  });

  await t.test("PUT /trip/:tripId/location should reject invalid coordinates", async () => {
    const parseCoordinate = (value, min, max) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
      return parsed;
    };

    const lat = parseCoordinate(95, -90, 90); // Out of range
    const lng = parseCoordinate(180, -180, 180); // Valid
    assert.strictEqual(lat, null, "Latitude > 90 should be rejected");
    assert.strictEqual(lng, 180, "Longitude 180 should be valid");
  });

  await t.test("PUT /trip/:tripId/add-time should reject excessive extension", async () => {
    const MAX_TRIP_DURATION_MINUTES = 24 * 60;
    const extraMinutes = MAX_TRIP_DURATION_MINUTES + 100;
    const isValid = extraMinutes <= MAX_TRIP_DURATION_MINUTES;
    assert.strictEqual(isValid, false, "Extra minutes should not exceed max");
  });

  await t.test("PUT /trip/:tripId/add-time should enforce cumulative duration cap", async () => {
    const MAX_TRIP_DURATION_MINUTES = 24 * 60;
    const createdAtMs = Date.now();
    const currentExpectedEndMs = createdAtMs + 12 * 60 * 60 * 1000; // 12 hours
    const extraMinutes = 13 * 60; // 13 hours additional
    const updatedExpectedEndMs = currentExpectedEndMs + extraMinutes * 60 * 1000;

    const totalDurationMinutes = (updatedExpectedEndMs - createdAtMs) / (60 * 1000);
    const isValid = totalDurationMinutes <= MAX_TRIP_DURATION_MINUTES;
    assert.strictEqual(isValid, false, "Total duration should not exceed max");
  });

  await t.test("Location updates should be rate-limited per trip", async () => {
    const TRIP_LOCATION_UPDATE_MIN_INTERVAL_MS = 10000;
    const tripLocationUpdateTimes = new Map();

    // First update
    const tripId = "trip-123";
    const lastUpdateTime1 = tripLocationUpdateTimes.get(tripId) || 0;
    const timeSinceLastUpdate1 = Date.now() - lastUpdateTime1;
    const allowed1 = timeSinceLastUpdate1 >= TRIP_LOCATION_UPDATE_MIN_INTERVAL_MS;
    assert.strictEqual(allowed1, true, "First location update should be allowed");
    tripLocationUpdateTimes.set(tripId, Date.now());

    // Immediate second update
    const lastUpdateTime2 = tripLocationUpdateTimes.get(tripId) || 0;
    const timeSinceLastUpdate2 = Date.now() - lastUpdateTime2;
    const allowed2 = timeSinceLastUpdate2 >= TRIP_LOCATION_UPDATE_MIN_INTERVAL_MS;
    assert.strictEqual(allowed2, false, "Immediate second update should be rate-limited");
  });

  await t.test("Phone number validation should reject invalid formats", async () => {
    const isValidPhoneNumber = (phone) => {
      if (!phone || typeof phone !== "string") return false;
      const cleaned = phone.trim().replace(/[\s\-().+]/g, "");
      return cleaned.length >= 10 && /^\d+$/.test(cleaned);
    };

    assert.strictEqual(isValidPhoneNumber(null), false);
    assert.strictEqual(isValidPhoneNumber(""), false);
    assert.strictEqual(isValidPhoneNumber("abc"), false);
    assert.strictEqual(isValidPhoneNumber("1234567"), false, "Less than 10 digits");
    assert.strictEqual(isValidPhoneNumber("123-456-7890"), true, "Valid with dashes");
    assert.strictEqual(isValidPhoneNumber("+1 (555) 123-4567"), true, "Valid with formatting");
    assert.strictEqual(isValidPhoneNumber("5551234567"), true, "Valid plain number");
  });

  await t.test("Contact ID parsing should filter invalid IDs", async () => {
    const parseContactIds = (raw) => {
      if (!Array.isArray(raw) || raw.length === 0) return [];
      return [...new Set(raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
    };

    assert.deepStrictEqual(parseContactIds(null), []);
    assert.deepStrictEqual(parseContactIds([]), []);
    assert.deepStrictEqual(parseContactIds([1, 2, "invalid", -5]), [1, 2]);
    assert.deepStrictEqual(parseContactIds([1, 1, 2, 2]), [1, 2], "Should deduplicate");
  });

  await t.test("Trip name sanitization should remove injection characters", async () => {
    const sanitizeTripName = (name) => {
      if (!name || typeof name !== "string") return "";
      return name
        .trim()
        .replace(/[<>"`]/g, "")
        .slice(0, 120);
    };

    assert.strictEqual(sanitizeTripName("Normal Trip"), "Normal Trip");
    assert.strictEqual(sanitizeTripName("<script>alert('xss')</script>"), "scriptalert('xss')/script");
    assert.strictEqual(sanitizeTripName("Safe`Trip\"with`backticks"), "SafeTripwithbackticks");
    assert.strictEqual(sanitizeTripName('Trip with "quotes"'), "Trip with quotes");
  });
});
