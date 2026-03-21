import { describe, it, expect } from "vitest";
import { circlePolygon } from "../../utils/circlePolygon.js";

describe("circlePolygon", () => {
  it("returns numPoints + 1 coordinates (closed ring) with default 32 points", () => {
    const coords = circlePolygon(79.8612, 6.9271, 500);
    expect(coords).toHaveLength(33);
  });

  it("first and last coordinates are identical (closed polygon)", () => {
    const coords = circlePolygon(79.8612, 6.9271, 500);
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });

  it("respects a custom numPoints argument", () => {
    const coords = circlePolygon(79.8612, 6.9271, 500, 16);
    expect(coords).toHaveLength(17);
  });

  it("each coordinate is an array of exactly two numbers", () => {
    const coords = circlePolygon(79.8612, 6.9271, 500);
    for (const coord of coords) {
      expect(coord).toHaveLength(2);
      expect(typeof coord[0]).toBe("number");
      expect(typeof coord[1]).toBe("number");
    }
  });

  it("a larger radius produces a wider spread of coordinates", () => {
    const small = circlePolygon(79.8612, 6.9271, 100);
    const large = circlePolygon(79.8612, 6.9271, 10000);
    const smallSpread = Math.max(...small.map((c) => c[0])) - Math.min(...small.map((c) => c[0]));
    const largeSpread = Math.max(...large.map((c) => c[0])) - Math.min(...large.map((c) => c[0]));
    expect(largeSpread).toBeGreaterThan(smallSpread);
  });
});
