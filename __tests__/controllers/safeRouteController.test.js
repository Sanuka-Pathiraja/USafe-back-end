import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock axios — no real Mapbox requests
vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

// Mock fetchRedZones — no real Supabase connection
vi.mock("../../utils/fetchRedZones.js", () => ({
  default: vi.fn(),
}));

import axios from "axios";
import fetchRedZones from "../../utils/fetchRedZones.js";
import { getSafeRoute } from "../../Controller/safeRouteController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// Route coordinates that pass through the hardcoded start area (lat ~6.9221, lon ~79.8668)
const dangerRouteGeometry = {
  coordinates: [[79.8668, 6.9221]],
};

// Route coordinates far from any red zone
const safeRouteGeometry = {
  coordinates: [[80.5, 8.0], [80.6, 8.1]],
};

// A red zone centred exactly on the danger route
const nearRedZone = { lat: 6.9221, lon: 79.8668, radius: 500 };

// A red zone far from any route
const farRedZone = { lat: 8.5, lon: 82.0, radius: 50 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MAPBOX_TOKEN = "test-mapbox-token";
});

describe("getSafeRoute", () => {
  it("returns 404 when Mapbox returns no routes", async () => {
    fetchRedZones.mockResolvedValue([]);
    axios.get.mockResolvedValue({ data: { routes: [] } });

    const req = { method: "GET", body: {}, query: {} };
    const res = makeRes();
    await getSafeRoute(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "No routes found" }));
  });

  it("returns safe original route when no red zones are active", async () => {
    fetchRedZones.mockResolvedValue([]);
    axios.get.mockResolvedValue({
      data: { routes: [{ geometry: safeRouteGeometry, distance: 1500, duration: 200 }] },
    });

    const req = { method: "GET", body: {}, query: {} };
    const res = makeRes();
    await getSafeRoute(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.originalRoute.isDangerous).toBe(false);
    expect(payload.message).toContain("safe");
  });

  it("marks original route as safe when it does not intersect any red zone", async () => {
    fetchRedZones.mockResolvedValue([nearRedZone]);
    axios.get.mockResolvedValue({
      data: { routes: [{ geometry: safeRouteGeometry, distance: 10000, duration: 600 }] },
    });

    const req = { method: "GET", body: {}, query: {} };
    const res = makeRes();
    await getSafeRoute(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.originalRoute.isDangerous).toBe(false);
    expect(payload.safeRoute).toBeDefined();
  });

  it("flags original route as dangerous and returns a safe alternative when available", async () => {
    fetchRedZones.mockResolvedValue([nearRedZone]);
    axios.get.mockResolvedValue({
      data: {
        routes: [
          { geometry: dangerRouteGeometry, distance: 500, duration: 60 },  // dangerous
          { geometry: safeRouteGeometry,   distance: 10000, duration: 600 }, // safe
        ],
      },
    });

    const req = { method: "GET", body: {}, query: {} };
    const res = makeRes();
    await getSafeRoute(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.originalRoute.isDangerous).toBe(true);
    expect(payload.safeRoute).not.toBeNull();
    expect(payload.message).toContain("Safe alternative");
  });

  it("warns when original route is dangerous and no safe alternative is found", async () => {
    fetchRedZones.mockResolvedValue([nearRedZone]);
    // All routes pass through the danger zone, toll-exclude also dangerous
    axios.get.mockResolvedValue({
      data: {
        routes: [{ geometry: dangerRouteGeometry, distance: 500, duration: 60 }],
      },
    });

    const req = { method: "GET", body: {}, query: {} };
    const res = makeRes();
    await getSafeRoute(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.originalRoute.isDangerous).toBe(true);
    expect(payload.safeRoute).toBeNull();
    expect(payload.message).toContain("Warning");
  });

  it("returns 500 when fetchRedZones throws", async () => {
    fetchRedZones.mockRejectedValue(new Error("Could not load redzones from database."));

    const req = { method: "GET", body: {}, query: {} };
    const res = makeRes();
    await getSafeRoute(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error fetching route" })
    );
  });

  it("includes red zone polygon data in the response", async () => {
    fetchRedZones.mockResolvedValue([farRedZone]);
    axios.get.mockResolvedValue({
      data: { routes: [{ geometry: safeRouteGeometry, distance: 1000, duration: 120 }] },
    });

    const req = { method: "GET", body: {}, query: {} };
    const res = makeRes();
    await getSafeRoute(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.redZones).toHaveLength(1);
    expect(payload.redZones[0]).toMatchObject({
      center: { lat: farRedZone.lat, lon: farRedZone.lon },
      radius: farRedZone.radius,
    });
    expect(Array.isArray(payload.redZones[0].polygon)).toBe(true);
  });
});
