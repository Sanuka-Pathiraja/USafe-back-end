import { describe, it, expect } from "vitest";
import { calculateDistance } from "../../utils/distance.js";

describe("calculateDistance", () => {
  it("returns 0 when both points are the same", () => {
    expect(calculateDistance(6.9271, 79.8612, 6.9271, 79.8612)).toBe(0);
  });

  it("returns a positive number for two different points", () => {
    const dist = calculateDistance(6.9271, 79.8612, 7.2906, 80.6337);
    expect(dist).toBeGreaterThan(0);
  });

  it("is approximately symmetric (A→B ≈ B→A)", () => {
    const ab = calculateDistance(6.9271, 79.8612, 7.2906, 80.6337);
    const ba = calculateDistance(7.2906, 80.6337, 6.9271, 79.8612);
    expect(Math.abs(ab - ba)).toBeLessThan(0.001);
  });

  it("returns distance in metres (Colombo to Kandy ~90 km)", () => {
    const dist = calculateDistance(6.9271, 79.8612, 7.2906, 80.6337);
    expect(dist).toBeGreaterThan(85000);
    expect(dist).toBeLessThan(100000);
  });
});
