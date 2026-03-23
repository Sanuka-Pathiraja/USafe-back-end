import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SMS provider — no real SMS ever sent
vi.mock("../../CallFeat/notifylksms.js", () => ({
  sendNotifySMS: vi.fn(),
}));

import { sendNotifySMS } from "../../CallFeat/notifylksms.js";
import { sendEmergencyNotifications } from "../../Controller/NotifyLkSmsController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DISABLE_SMS;
});

describe("sendEmergencyNotifications", () => {
  it("returns 403 when DISABLE_SMS is true", async () => {
    process.env.DISABLE_SMS = "true";
    const req = { params: { sessionId: "s1" }, body: { contacts: [{ phone: "0711111111" }] }, originalUrl: "/" };
    const res = makeRes();
    await sendEmergencyNotifications(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(sendNotifySMS).not.toHaveBeenCalled();
  });

  it("returns 400 when contacts array is empty", async () => {
    const req = { params: { sessionId: "s1" }, body: { contacts: [] }, originalUrl: "/" };
    const res = makeRes();
    await sendEmergencyNotifications(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "contacts must be a non-empty array" })
    );
  });

  it("returns 400 when contacts is not an array", async () => {
    const req = { params: { sessionId: "s1" }, body: { contacts: "0711111111" }, originalUrl: "/" };
    const res = makeRes();
    await sendEmergencyNotifications(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("sends SMS to all contacts and returns ok:true when all succeed", async () => {
    sendNotifySMS.mockResolvedValue({ status: "sent" });
    const req = {
      params: { sessionId: "session-001" },
      body: {
        contacts: [{ phone: "0711111111" }, { phone: "0722222222" }],
        locationText: "Colombo Fort",
      },
      originalUrl: "/notify",
    };
    const res = makeRes();
    await sendEmergencyNotifications(req, res);
    expect(sendNotifySMS).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, sent: 2, total: 2 })
    );
  });

  it("reports partial failures and still returns ok:true if at least one succeeds", async () => {
    sendNotifySMS
      .mockResolvedValueOnce({ status: "sent" })
      .mockRejectedValueOnce(new Error("Provider error"));
    const req = {
      params: { sessionId: "session-001" },
      body: { contacts: [{ phone: "0711111111" }, { phone: "0722222222" }] },
      originalUrl: "/notify",
    };
    const res = makeRes();
    await sendEmergencyNotifications(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.sent).toBe(1);
    expect(payload.total).toBe(2);
  });

  it("returns ok:false when ALL contacts fail", async () => {
    sendNotifySMS.mockRejectedValue(new Error("Provider down"));
    const req = {
      params: { sessionId: "session-001" },
      body: { contacts: [{ phone: "0711111111" }] },
      originalUrl: "/notify",
    };
    const res = makeRes();
    await sendEmergencyNotifications(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(false);
    expect(payload.sent).toBe(0);
  });
});
