import test from "node:test";
import assert from "node:assert/strict";
import { haversineMeters } from "../utils/geo.js";

test("haversineMeters returns ~0 for identical points", () => {
  const distance = haversineMeters(6.9271, 79.8612, 6.9271, 79.8612);
  assert.ok(distance < 0.001);
});

test("haversineMeters is symmetric", () => {
  const a = haversineMeters(6.9271, 79.8612, 7.2906, 80.6337);
  const b = haversineMeters(7.2906, 80.6337, 6.9271, 79.8612);
  assert.ok(Math.abs(a - b) < 0.0001);
});

test("haversineMeters returns plausible positive distance", () => {
  const distance = haversineMeters(6.9271, 79.8612, 7.2906, 80.6337);
  assert.ok(distance > 50000);
  assert.ok(distance < 120000);
});
