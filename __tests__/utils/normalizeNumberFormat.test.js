import { describe, it, expect } from "vitest";
import { normalizeNum } from "../../utils/normalizeNumberFormat.js";

describe("normalizeNum", () => {
  it("converts 07XXXXXXXX (10 digits starting with 0) to 94XXXXXXXXX", () => {
    expect(normalizeNum("0712345678")).toBe("94712345678");
  });

  it("keeps 94XXXXXXXXX (11 digits starting with 94) unchanged", () => {
    expect(normalizeNum("94712345678")).toBe("94712345678");
  });

  it("converts +94XXXXXXXXX to 94XXXXXXXXX (strips the +)", () => {
    expect(normalizeNum("+94712345678")).toBe("94712345678");
  });

  it("converts 7XXXXXXXX (9 digits starting with 7) to 94XXXXXXXXX", () => {
    expect(normalizeNum("712345678")).toBe("94712345678");
  });

  it("strips non-digit characters before processing", () => {
    expect(normalizeNum("077-123-4567")).toBe("94771234567");
  });

  it("throws for an invalid number", () => {
    expect(() => normalizeNum("12345")).toThrow("Invalid LK number format");
  });

  it("throws for an empty string", () => {
    expect(() => normalizeNum("")).toThrow("Invalid LK number format");
  });
});
