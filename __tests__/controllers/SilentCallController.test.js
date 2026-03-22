import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

// Mock voice provider — no real calls made
vi.mock("../../CallFeat/voiceService.js", () => ({
  default: vi.fn(),
}));

// The controller imports emergencySessions from EmergencyProcessController.
// We mock that module to provide an in-memory Map we can observe.
const mockEmergencySessions = vi.hoisted(() => new Map());
vi.mock("../../Controller/EmergencyProcessController.js", () => ({
  emergencySessions: mockEmergencySessions,
}));

import AppDataSource from "../../config/data-source.js";
import makeOutboundCall from "../../CallFeat/voiceService.js";
import { submitSilentCall } from "../../Controller/SilentCallController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeRepo(overrides = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEmergencySessions.clear();
  delete process.env.ALLOW_DEMO_CALL_FALLBACK;
});

describe("submitSilentCall", () => {
  it("returns 400 when message is missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = {
      user: { id: 1 },
      body: { contacts: [{ contactId: 1 }] },
      headers: {},
    };
    const res = makeRes();
    await submitSilentCall(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "MESSAGE_REQUIRED" })
    );
  });

  it("returns 400 when no contacts are provided", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = {
      user: { id: 1 },
      body: { message: "Help!", contacts: [] },
      headers: {},
    };
    const res = makeRes();
    await submitSilentCall(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CONTACTS_REQUIRED" })
    );
  });

  it("returns 422 when none of the contacts have a valid contactId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = {
      user: { id: 1 },
      body: { message: "Help!", contacts: [{ contactId: "abc" }] }, // invalid ID
      headers: {},
    };
    const res = makeRes();
    await submitSilentCall(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CONTACT_ID_REQUIRED" })
    );
  });

  it("returns 422 when a contactId does not belong to the user", async () => {
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([]) }); // DB returns 0 matching contacts
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = {
      user: { id: 1 },
      body: { message: "Help!", contacts: [{ contactId: 999 }] },
      headers: {},
    };
    const res = makeRes();
    await submitSilentCall(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CONTACT_VALIDATION_FAILED" })
    );
  });

  it("returns 502 when call provider fails and demo fallback is disabled", async () => {
    const contact = { contactId: 1, name: "Alice", relationship: "Friend", phone: "0711111111" };
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([contact]) });
    AppDataSource.getRepository.mockReturnValue(repo);
    makeOutboundCall.mockRejectedValue(new Error("Vonage error"));
    // ALLOW_DEMO_CALL_FALLBACK is not set — fallback disabled
    const req = {
      user: { id: 1 },
      body: { message: "Help!", contacts: [{ contactId: 1 }] },
      headers: {},
    };
    const res = makeRes();
    await submitSilentCall(req, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SILENT_CALL_FAILED" })
    );
  });

  // Note: allowDemoCallFallback is a module-level constant evaluated at import time.
  // Testing the demo fallback path would require vi.resetModules() + dynamic import.
  // It is exercised indirectly by the integration test suite.

  it("initiates a real call and returns success when provider responds", async () => {
    const contact = { contactId: 1, name: "Alice", relationship: "Friend", phone: "0711111111" };
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([contact]) });
    AppDataSource.getRepository.mockReturnValue(repo);
    makeOutboundCall.mockResolvedValue({ uuid: "call-uuid-001" });
    const req = {
      user: { id: 1 },
      body: { message: "Play this message", contacts: [{ contactId: 1 }] },
      headers: {},
    };
    const res = makeRes();
    await submitSilentCall(req, res);
    expect(makeOutboundCall).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, queuedCalls: 1 })
    );
  });
});
