import { describe, it, expect } from "vitest";
import { generatePayHereHash } from "../../utils/payhereHash.js";

describe("generatePayHereHash", () => {
  it("returns a 32-character uppercase hex string", () => {
    const hash = generatePayHereHash("123456", "ORDER001", "100.00", "LKR", "MYSECRET");
    expect(hash).toMatch(/^[A-F0-9]{32}$/);
  });

  it("is deterministic — same inputs always produce the same hash", () => {
    const args = ["123456", "ORDER001", "100.00", "LKR", "MYSECRET"];
    expect(generatePayHereHash(...args)).toBe(generatePayHereHash(...args));
  });

  it("produces a different hash when the order ID changes", () => {
    const hash1 = generatePayHereHash("123456", "ORDER001", "100.00", "LKR", "MYSECRET");
    const hash2 = generatePayHereHash("123456", "ORDER002", "100.00", "LKR", "MYSECRET");
    expect(hash1).not.toBe(hash2);
  });

  it("produces a different hash when the merchant secret changes", () => {
    const hash1 = generatePayHereHash("123456", "ORDER001", "100.00", "LKR", "SECRET_A");
    const hash2 = generatePayHereHash("123456", "ORDER001", "100.00", "LKR", "SECRET_B");
    expect(hash1).not.toBe(hash2);
  });

  it("produces a different hash when the amount changes", () => {
    const hash1 = generatePayHereHash("123456", "ORDER001", "100.00", "LKR", "MYSECRET");
    const hash2 = generatePayHereHash("123456", "ORDER001", "200.00", "LKR", "MYSECRET");
    expect(hash1).not.toBe(hash2);
  });
});
