import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRadiusMeters,
  isLikelyPhoneNumber,
  toNumber,
  isValidLatLng,
} from "../Controller/guardianTrackingController.js";

test("normalizeRadiusMeters clamps values into allowed range", () => {
  assert.equal(normalizeRadiusMeters(5), 10);
  assert.equal(normalizeRadiusMeters(50), 50);
  assert.equal(normalizeRadiusMeters(999), 500);
});

test("normalizeRadiusMeters falls back for non-numeric values", () => {
  assert.equal(normalizeRadiusMeters("foo"), 50);
});

test("isLikelyPhoneNumber validates E.164-like numbers", () => {
  assert.equal(isLikelyPhoneNumber("+94771234567"), true);
  assert.equal(isLikelyPhoneNumber("94771234567"), true);
  assert.equal(isLikelyPhoneNumber("12345"), false);
  assert.equal(isLikelyPhoneNumber("abc"), false);
});

test("toNumber returns null for invalid numeric inputs", () => {
  assert.equal(toNumber("7.5"), 7.5);
  assert.equal(toNumber("nan"), null);
  assert.equal(toNumber(undefined), null);
});

test("isValidLatLng enforces latitude and longitude ranges", () => {
  assert.equal(isValidLatLng(6.9271, 79.8612), true);
  assert.equal(isValidLatLng(-91, 79.8), false);
  assert.equal(isValidLatLng(6.9, 181), false);
});
