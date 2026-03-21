import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios so no real Mapbox requests are made
vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

import axios from "axios";
import { getSafeRoute } from "../../Controller/safeRouteController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// A route that does NOT pass through the red zone (far away coords)
const safeRouteGeometry = {
  coordinates: [[79.0, 7.5], [79.1, 7.6]],
};

// A route that DOES pass through the red zone (coords near zone centre)
const dangerRouteGeometry = {
  coordinates: [[79.8612, 6.9271]], // exactly at zone centre
};

const redZone = { lat: 6.9271, lon: 79.8612, radius: 1000 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MAPBOX_TOKEN = "test-mapbox-token";
});

describe("getSafeRoute", () => {
  it("returns 500 when MAPBOX_TOKEN is not configured", async () => {
    delete process.env.MAPBOX_TOKEN;
    const req = { method: "POST", body: {} };
    const res = makeRes();
    await getSafeRoute(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "MAPBOX_TOKEN is not configured" })
    );
  });

  it("returns 400 when start or end coordinates are missing", async () => {
    const req = {
      method: "POST",
      body: { redZones: [redZone] }, // no start/end
    };
    const res = makeRes();
    await getSafeRoute(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("required") })
    );
  });

  it("returns 400 when redZones is empty", async () => {
    const req = {
      method: "POST",
      body: { startLat: 6.9, startLon: 79.8, endLat: 7.2, endLon: 80.6, redZones: [] },
    };
    const res = makeRes();
    await getSafeRoute(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("redZones") })
    );
  });

  it("returns 404 when Mapbox returns no routes", async () => {
    axios.get.mockResolvedValue({ data: { routes: [] } });
    const req = {
      method: "POST",
      body: { startLat: 6.9, startLon: 79.8, endLat: 7.2, endLon: 80.6, redZones: [redZone] },
    };
    const res = makeRes();
    await getSafeRoute(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "No routes found" })
    );
  });

  it("returns original route as safe when it does not intersect any zone", async () => {
    axios.get.mockResolvedValue({
      data: {
        routes: [{ geometry: safeRouteGeometry, distance: 15000, duration: 900 }],
      },
    });
    const req = {
      method: "POST",
      body: { startLat: 7.5, startLon: 79.0, endLat: 7.6, endLon: 79.1, redZones: [redZone] },
    };
    const res = makeRes();
    await getSafeRoute(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.originalRoute.isDangerous).toBe(false);
    expect(payload.message).toContain("safe");
  });

  it("flags original route as dangerous and provides safe alternative when available", async () => {
    // First call returns dangerous route + a safe alternative
    axios.get.mockResolvedValue({
      data: {
        routes: [
          { geometry: dangerRouteGeometry, distance: 5000, duration: 300 }, // dangerous
          { geometry: safeRouteGeometry, distance: 15000, duration: 900 },  // safe
        ],
      },
    });
    const req = {
      method: "POST",
      body: { startLat: 6.9271, startLon: 79.8612, endLat: 7.0, endLon: 80.0, redZones: [redZone] },
    };
    const res = makeRes();
    await getSafeRoute(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.originalRoute.isDangerous).toBe(true);
    expect(payload.safeRoute).not.toBeNull();
    expect(payload.message).toContain("Safe alternative");
  });
});
