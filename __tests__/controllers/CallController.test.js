import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the voice provider — no real calls ever made
vi.mock("../../CallFeat/voiceService.js", () => ({
  default: vi.fn(),
}));

import makeOutboundCall from "../../CallFeat/voiceService.js";
import { initiateCall } from "../../Controller/CallController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure a default call target so most tests don't fail on missing config
  process.env.SOS_CALL_TO = "94711111111";
  // Ensure production flag is off by default
  delete process.env.NODE_ENV;
});

describe("initiateCall", () => {
  // Note: DISABLE_CALLS is evaluated at module load time.
  // Tests here run with DISABLE_CALLS unset (= false).

  // Note: IS_PRODUCTION is a module-level constant evaluated at import time.
  // Testing the production guard would require vi.resetModules() + dynamic import.
  // Here we test the equivalent dev-mode guard (ALLOW_DEV_CUSTOM_CALL_TARGET).

  it("returns 403 when custom target is not allowed in dev (ALLOW_DEV_CUSTOM_CALL_TARGET not set)", async () => {
    delete process.env.ALLOW_DEV_CUSTOM_CALL_TARGET;
    delete process.env.NODE_ENV;
    const req = { body: { to: "0711111111" } };
    const res = makeRes();
    await initiateCall(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("ALLOW_DEV_CUSTOM_CALL_TARGET") })
    );
  });

  it("returns 500 when SOS_CALL_TO is not configured and no custom target provided", async () => {
    delete process.env.SOS_CALL_TO;
    const req = { body: {} };
    const res = makeRes();
    await initiateCall(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("SOS_CALL_TO") })
    );
  });

  it("initiates a call to SOS_CALL_TO and returns 200 on success", async () => {
    process.env.SOS_CALL_TO = "94711111111";
    makeOutboundCall.mockResolvedValue({ uuid: "call-uuid-001" });
    const req = { body: {} };
    const res = makeRes();
    await initiateCall(req, res);
    expect(makeOutboundCall).toHaveBeenCalledWith("94711111111");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Call initiated successfully" })
    );
  });

  it("returns 500 when the call provider throws", async () => {
    process.env.SOS_CALL_TO = "94711111111";
    makeOutboundCall.mockRejectedValue(new Error("Vonage error"));
    const req = { body: {} };
    const res = makeRes();
    await initiateCall(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to make call" })
    );
  });
});
