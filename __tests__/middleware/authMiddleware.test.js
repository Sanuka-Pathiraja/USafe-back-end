import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jsonwebtoken before importing the middleware
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(),
  },
}));

import jwt from "jsonwebtoken";
import authMiddleware from "../../middleware/authMiddleware.js";

function makeResMock() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authMiddleware", () => {
  it("returns 401 when no Authorization header is present", () => {
    const req = { headers: {} };
    const res = makeResMock();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is not a Bearer token", () => {
    const req = { headers: { authorization: "Basic sometoken" } };
    const res = makeResMock();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() and sets req.user when token is valid", () => {
    jwt.verify.mockReturnValue({ id: 42, email: "test@example.com" });

    const req = { headers: { authorization: "Bearer validtoken" } };
    const res = makeResMock();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 42, email: "test@example.com" });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when jwt.verify throws (invalid/expired token)", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const req = { headers: { authorization: "Bearer badtoken" } };
    const res = makeResMock();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
