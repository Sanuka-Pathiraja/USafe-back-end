import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

vi.mock("../../CallFeat/notifylksms.js", () => ({
  sendNotifySMS: vi.fn(),
}));

vi.mock("../../CallFeat/voiceService.js", () => ({
  default: vi.fn(),
}));

vi.mock("../../CallFeat/voiceCancel.js", () => ({
  hangupCall: vi.fn(),
}));

import AppDataSource from "../../config/data-source.js";
import { sendNotifySMS } from "../../CallFeat/notifylksms.js";
import {
  emergencySessions,
  startEmergency,
  getCallStatus,
  getEmergencyStatus,
  cancelEmergency,
  voiceEventWebhook,
  devMarkAnswered,
  devResetSession,
} from "../../Controller/EmergencyProcessController.js";

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
    findOneBy: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockReturnValue({}),
    update: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

// Seeds a session directly into the in-memory map for status/cancel/webhook tests
function seedSession(id, overrides = {}) {
  const session = {
    id,
    userId: 1,
    status: "ACTIVE",
    answeredBy: null,
    someoneAnswered: false,
    answeredByContactIndex: null,
    emergencyServicesCalled: false,
    messageSentAt: Date.now(),
    contacts: [
      { contactId: 1, name: "Alice", phone: "0711111111", relationship: "Friend" },
    ],
    calls: {},
    callAttempts: {},
    emergencyContext: {},
    generatedMessage: "Help!",
    smsReport: null,
    messaging: { success: true, code: "OK", attempted: 1, sent: 1, failed: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
  emergencySessions.set(id, session);
  return session;
}

beforeEach(() => {
  vi.clearAllMocks();
  emergencySessions.clear();
});

// ─── startEmergency ────────────────────────────────────────────────────────

describe("startEmergency", () => {
  it("returns 400 when user has no contacts", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ firstName: "Test", lastName: "User" }) });
    const contactRepo = makeRepo({ find: vi.fn().mockResolvedValue([]) });
    AppDataSource.getRepository
      .mockReturnValueOnce(userRepo)   // "User"
      .mockReturnValueOnce(contactRepo); // "Contact"

    const req = { user: { id: 1 }, body: { message: "Help!" }, headers: {}, originalUrl: "/emergency/start" };
    const res = makeRes();
    await startEmergency(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "NO_CONTACTS" }));
  });

  it("returns 400 when all contacts have invalid phone numbers", async () => {
    // Phone "ab" has 0 digits — fails isValidNotifyLkMobile (requires >= 9 digits)
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ firstName: "Test", lastName: "User" }) });
    const contactRepo = makeRepo({
      find: vi.fn().mockResolvedValue([{ contactId: 1, name: "Bad", relationship: "Friend", phone: "ab" }]),
    });
    AppDataSource.getRepository
      .mockReturnValueOnce(userRepo)
      .mockReturnValueOnce(contactRepo);

    const req = { user: { id: 1 }, body: { message: "Help!" }, headers: {}, originalUrl: "/emergency/start" };
    const res = makeRes();
    await startEmergency(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "NO_VALID_NUMBERS" }));
  });

  it("creates a session and returns success when SMS succeeds", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ firstName: "Jane", lastName: "Doe" }) });
    const contactRepo = makeRepo({
      find: vi.fn().mockResolvedValue([
        { contactId: 1, name: "Alice", relationship: "Friend", phone: "0711111111" },
      ]),
    });
    AppDataSource.getRepository
      .mockReturnValueOnce(userRepo)
      .mockReturnValueOnce(contactRepo);

    sendNotifySMS.mockResolvedValue({ ok: true });

    const req = {
      user: { id: 1 },
      body: { message: "Help!", locationText: "Colombo" },
      headers: {},
      originalUrl: "/emergency/start",
    };
    const res = makeRes();
    await startEmergency(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    // A session must have been stored
    const responsePayload = res.json.mock.calls[0][0];
    expect(responsePayload.sessionId).toBeDefined();
    expect(emergencySessions.has(responsePayload.sessionId)).toBe(true);
  });

  it("creates a session with success:false when SMS fails", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ firstName: "Jane", lastName: "Doe" }) });
    const contactRepo = makeRepo({
      find: vi.fn().mockResolvedValue([
        { contactId: 1, name: "Alice", relationship: "Friend", phone: "0711111111" },
      ]),
    });
    AppDataSource.getRepository
      .mockReturnValueOnce(userRepo)
      .mockReturnValueOnce(contactRepo);

    sendNotifySMS.mockRejectedValue(new Error("Notify.lk down"));

    const req = {
      user: { id: 1 },
      body: { message: "Help!" },
      headers: {},
      originalUrl: "/emergency/start",
    };
    const res = makeRes();
    await startEmergency(req, res);

    // Still returns a session, but success is false
    const responsePayload = res.json.mock.calls[0][0];
    expect(responsePayload.sessionId).toBeDefined();
    expect(responsePayload.success).toBe(false);
  });
});

// ─── getCallStatus ─────────────────────────────────────────────────────────

describe("getCallStatus", () => {
  it("returns 404 when session does not exist", async () => {
    const req = { user: { id: 1 }, params: { sessionId: "no-such-id", callId: "c1" } };
    const res = makeRes();
    await getCallStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "SESSION_NOT_FOUND" }));
  });

  it("returns 403 when session belongs to a different user", async () => {
    seedSession("sess-1", { userId: 99 });
    const req = { user: { id: 1 }, params: { sessionId: "sess-1", callId: "c1" } };
    const res = makeRes();
    await getCallStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("returns 404 when callId is not in the session", async () => {
    seedSession("sess-2");
    const req = { user: { id: 1 }, params: { sessionId: "sess-2", callId: "ghost-call" } };
    const res = makeRes();
    await getCallStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CALL_NOT_FOUND" }));
  });

  it("returns call status when call exists", async () => {
    const session = seedSession("sess-3");
    session.calls["call-123"] = { status: "ringing", answered: false, startedAt: Date.now() };

    const req = { user: { id: 1 }, params: { sessionId: "sess-3", callId: "call-123" } };
    const res = makeRes();
    await getCallStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ringing", answered: false })
    );
  });
});

// ─── getEmergencyStatus ────────────────────────────────────────────────────

describe("getEmergencyStatus", () => {
  it("returns 404 when session does not exist", async () => {
    const req = { user: { id: 1 }, params: { sessionId: "no-such-id" } };
    const res = makeRes();
    await getEmergencyStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "SESSION_NOT_FOUND" }));
  });

  it("returns session details when session exists", async () => {
    seedSession("sess-status-1");
    const req = { user: { id: 1 }, params: { sessionId: "sess-status-1" } };
    const res = makeRes();
    await getEmergencyStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-status-1", sessionStatus: "ACTIVE" })
    );
  });
});

// ─── cancelEmergency ───────────────────────────────────────────────────────

describe("cancelEmergency", () => {
  it("returns 404 when session does not exist", async () => {
    const req = { user: { id: 1 }, params: { sessionId: "no-such-id" }, headers: {} };
    const res = makeRes();
    await cancelEmergency(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "SESSION_NOT_FOUND" }));
  });

  it("returns ALREADY_CANCELLED when session was already cancelled", async () => {
    seedSession("sess-cancel-1", { status: "CANCELLED" });
    const req = {
      user: { id: 1 },
      params: { sessionId: "sess-cancel-1" },
      headers: {},
      originalUrl: "/emergency/cancel",
    };
    const res = makeRes();
    await cancelEmergency(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ALREADY_CANCELLED", cancelled: true })
    );
  });

  it("cancels an active session and notifies contacts", async () => {
    seedSession("sess-cancel-2");
    sendNotifySMS.mockResolvedValue({ ok: true });

    const req = {
      user: { id: 1 },
      params: { sessionId: "sess-cancel-2" },
      headers: {},
      originalUrl: "/emergency/cancel",
    };
    const res = makeRes();
    await cancelEmergency(req, res);

    expect(sendNotifySMS).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CANCELLED", cancelled: true })
    );
    expect(emergencySessions.get("sess-cancel-2").status).toBe("CANCELLED");
  });
});

// ─── voiceEventWebhook ─────────────────────────────────────────────────────

describe("voiceEventWebhook", () => {
  it("returns 200 with 'missing identifiers' when sessionId is absent", async () => {
    const req = {
      query: { sessionId: "", contactIndex: "1" },
      body: { uuid: "call-abc", status: "ringing" },
      headers: {},
      originalUrl: "/webhooks/voice-event",
    };
    const res = makeRes();
    await voiceEventWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ note: "missing identifiers" }));
  });

  it("returns 200 with 'unknown session' when sessionId is not in map", async () => {
    const req = {
      query: { sessionId: "ghost-session", contactIndex: "1" },
      body: { uuid: "call-abc", status: "ringing" },
      headers: {},
      originalUrl: "/webhooks/voice-event",
    };
    const res = makeRes();
    await voiceEventWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ note: "unknown session" }));
  });

  it("normalizes 'answered' status to 'in-progress' and updates call entry", async () => {
    // Note: normalizeCallStatus("answered") → "in-progress"
    // The check `if (status === "answered")` in the webhook handler is therefore never true.
    // Session remains ACTIVE; the call's status is stored as "in-progress".
    seedSession("sess-webhook-1");
    emergencySessions.get("sess-webhook-1").calls["call-xyz"] = {
      contactIndex: 1,
      to: "0711111111",
      status: "ringing",
      answered: false,
      startedAt: Date.now(),
    };

    const req = {
      query: { sessionId: "sess-webhook-1", contactIndex: "1" },
      body: { uuid: "call-xyz", status: "answered" },
      headers: {},
      originalUrl: "/webhooks/voice-event",
    };
    const res = makeRes();
    await voiceEventWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const session = emergencySessions.get("sess-webhook-1");
    // "answered" normalizes to "in-progress" — session stays ACTIVE
    expect(session.calls["call-xyz"].status).toBe("in-progress");
    expect(session.status).toBe("ACTIVE");
  });

  it("records a new call entry when callId is not already in session.calls", async () => {
    seedSession("sess-webhook-2");

    const req = {
      query: { sessionId: "sess-webhook-2", contactIndex: "1" },
      body: { uuid: "new-call-id", status: "ringing" },
      headers: {},
      originalUrl: "/webhooks/voice-event",
    };
    const res = makeRes();
    await voiceEventWebhook(req, res);

    const session = emergencySessions.get("sess-webhook-2");
    expect(session.calls["new-call-id"]).toBeDefined();
    expect(session.calls["new-call-id"].status).toBe("ringing");
  });
});

// ─── devMarkAnswered ───────────────────────────────────────────────────────

describe("devMarkAnswered", () => {
  it("returns 404 when session does not exist", async () => {
    const req = {
      user: { id: 1 },
      params: { sessionId: "no-such-id" },
      query: { contactIndex: "1" },
    };
    const res = makeRes();
    await devMarkAnswered(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "SESSION_NOT_FOUND" }));
  });

  it("returns 400 for an out-of-range contactIndex", async () => {
    seedSession("sess-dev-1");
    const req = {
      user: { id: 1 },
      params: { sessionId: "sess-dev-1" },
      query: { contactIndex: "99" },
    };
    const res = makeRes();
    await devMarkAnswered(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_CONTACT_INDEX" }));
  });

  it("marks session as ANSWERED with the given contact index", async () => {
    seedSession("sess-dev-2");
    const req = {
      user: { id: 1 },
      params: { sessionId: "sess-dev-2" },
      query: { contactIndex: "1" },
    };
    const res = makeRes();
    await devMarkAnswered(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    const session = emergencySessions.get("sess-dev-2");
    expect(session.status).toBe("ANSWERED");
    expect(session.answeredByContactIndex).toBe(1);
  });
});

// ─── devResetSession ───────────────────────────────────────────────────────

describe("devResetSession", () => {
  it("returns 404 when session does not exist", async () => {
    const req = { user: { id: 1 }, params: { sessionId: "no-such-id" } };
    const res = makeRes();
    await devResetSession(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "SESSION_NOT_FOUND" }));
  });

  it("resets an ANSWERED session back to ACTIVE", async () => {
    const session = seedSession("sess-reset-1", { status: "ANSWERED", someoneAnswered: true });
    session.calls["c1"] = { status: "completed" };

    const req = { user: { id: 1 }, params: { sessionId: "sess-reset-1" } };
    const res = makeRes();
    await devResetSession(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sessionStatus: "ACTIVE" }));
    const updated = emergencySessions.get("sess-reset-1");
    expect(updated.status).toBe("ACTIVE");
    expect(updated.someoneAnswered).toBe(false);
    expect(updated.calls).toEqual({});
  });
});
