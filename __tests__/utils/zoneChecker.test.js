import { describe, it, expect } from "vitest";
import routeIntersectsZones from "../../utils/zoneChecker.js";

describe("routeIntersectsZones", () => {
  const zone = { lat: 6.9271, lon: 79.8612, radius: 500 }; // 500m radius, Colombo

  it("returns true when a route coord is inside a zone", () => {
    // Same point as zone centre — definitely inside
    const routeCoords = [[79.8612, 6.9271]];
    expect(routeIntersectsZones(routeCoords, [zone])).toBe(true);
  });

  it("returns false when all route coords are outside all zones", () => {
    // Kandy coords, far from the Colombo zone
    const routeCoords = [[80.6337, 7.2906]];
    expect(routeIntersectsZones(routeCoords, [zone])).toBe(false);
  });

  it("returns true if at least one coord is inside a zone", () => {
    const routeCoords = [
      [80.6337, 7.2906],   // outside
      [79.8612, 6.9271],   // inside
    ];
    expect(routeIntersectsZones(routeCoords, [zone])).toBe(true);
  });

  it("returns false for an empty route", () => {
    expect(routeIntersectsZones([], [zone])).toBe(false);
  });

  it("returns false when there are no zones", () => {
    const routeCoords = [[79.8612, 6.9271]];
    expect(routeIntersectsZones(routeCoords, [])).toBe(false);
  });
});
