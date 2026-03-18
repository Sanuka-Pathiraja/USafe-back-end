import test from "node:test";
import assert from "node:assert/strict";
import { getTrackingIdValidationError, buildPublicTrackingPayload } from "../utils/tracking.js";

test("getTrackingIdValidationError requires trackingId", () => {
  assert.equal(getTrackingIdValidationError(""), "trackingId is required");
  assert.equal(getTrackingIdValidationError(null), "trackingId is required");
});

test("getTrackingIdValidationError rejects malformed token", () => {
  assert.equal(getTrackingIdValidationError("bad token"), "Invalid trackingId format");
  assert.equal(getTrackingIdValidationError("abc"), "Invalid trackingId format");
});

test("getTrackingIdValidationError accepts valid token", () => {
  assert.equal(getTrackingIdValidationError("AbC123xYz9"), null);
});

test("buildPublicTrackingPayload remains sanitized", () => {
  const payload = buildPublicTrackingPayload({
    trackingId: "AbC123xYz9",
    tripName: "Office to Home",
    status: "ACTIVE",
    expectedEndTime: "2026-03-20T10:00:00.000Z",
    lastKnownLat: 6.9271,
    lastKnownLng: 79.8612,
    updatedAt: "2026-03-20T09:50:00.000Z",
    userId: 123,
    contactIds: [1, 2],
  });

  assert.equal(payload.trackingId, "AbC123xYz9");
  assert.equal(payload.tripName, "Office to Home");
  assert.equal(payload.status, "ACTIVE");
  assert.equal(payload.isTrackingActive, true);
  assert.equal(payload.isTerminal, false);
  assert.equal(payload.hasLiveLocation, true);
  assert.equal(payload.lastKnownLat, 6.9271);
  assert.equal(payload.lastKnownLng, 79.8612);
  assert.equal(payload.lastLocationUpdatedAt, "2026-03-20T09:50:00.000Z");
  assert.equal(payload.userId, undefined);
  assert.equal(payload.contactIds, undefined);
});
