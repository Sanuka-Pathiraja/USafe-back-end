import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSafetyScoreCoordinates,
  buildSafetyScoreCacheKey,
} from "../Controller/guardianController.js";

test("parseSafetyScoreCoordinates supports query lat/lng", () => {
  const req = {
    query: { lat: "6.9271", lng: "79.8612" },
    body: {},
  };

  const result = parseSafetyScoreCoordinates(req);
  assert.equal(result.parsedLat, 6.9271);
  assert.equal(result.parsedLng, 79.8612);
});

test("parseSafetyScoreCoordinates supports body latitude/longitude", () => {
  const req = {
    query: {},
    body: { latitude: "6.9000", longitude: "79.8000" },
  };

  const result = parseSafetyScoreCoordinates(req);
  assert.equal(result.parsedLat, 6.9);
  assert.equal(result.parsedLng, 79.8);
});

test("parseSafetyScoreCoordinates supports nested location payload", () => {
  const req = {
    query: {},
    body: { location: { lat: "7.1", lng: "80.2" } },
  };

  const result = parseSafetyScoreCoordinates(req);
  assert.equal(result.parsedLat, 7.1);
  assert.equal(result.parsedLng, 80.2);
});

test("buildSafetyScoreCacheKey normalizes coordinates for cache reuse", () => {
  const key1 = buildSafetyScoreCacheKey(6.9271234, 79.8612345);
  const key2 = buildSafetyScoreCacheKey(6.9271299, 79.8612399);

  assert.equal(key1, "6.9271:79.8612");
  assert.equal(key1, key2);
});
