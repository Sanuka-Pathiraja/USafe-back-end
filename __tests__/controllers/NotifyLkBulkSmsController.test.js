import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SMS provider — no real SMS ever sent
vi.mock("../../CallFeat/notifylksms.js", () => ({
  sendNotifySMS: vi.fn(),
}));

import { sendNotifySMS } from "../../CallFeat/notifylksms.js";
import { sendNotifyBulkSMS } from "../../Controller/NotifyLkBulkSmsController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DISABLE_SMS;
  delete process.env.DISABLE_BULK_SMS;
});

describe("sendNotifyBulkSMS", () => {
  it("returns 403 when DISABLE_SMS is true", async () => {
    process.env.DISABLE_SMS = "true";
    const req = { body: { recipients: [{ to: "0711111111" }], message: "Alert" }, originalUrl: "/" };
    const res = makeRes();
    await sendNotifyBulkSMS(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(sendNotifySMS).not.toHaveBeenCalled();
  });

  it("returns 403 when DISABLE_BULK_SMS is true", async () => {
    process.env.DISABLE_BULK_SMS = "true";
    const req = { body: { recipients: [{ to: "0711111111" }], message: "Alert" }, originalUrl: "/" };
    const res = makeRes();
    await sendNotifyBulkSMS(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 400 when recipients array is empty", async () => {
    const req = { body: { recipients: [], message: "Alert" }, originalUrl: "/" };
    const res = makeRes();
    await sendNotifyBulkSMS(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "recipients must be a non-empty array" })
    );
  });

  it("returns 400 when neither a global message nor per-recipient messages are provided", async () => {
    const req = {
      body: { recipients: [{ to: "0711111111" }] }, // no message at all
      originalUrl: "/",
    };
    const res = makeRes();
    await sendNotifyBulkSMS(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("sends SMS to all recipients and returns success summary", async () => {
    sendNotifySMS.mockResolvedValue({ status: "sent" });
    const req = {
      body: {
        recipients: [{ to: "0711111111" }, { to: "0722222222" }],
        message: "Emergency alert",
      },
      originalUrl: "/notify/bulk",
    };
    const res = makeRes();
    await sendNotifyBulkSMS(req, res);
    expect(sendNotifySMS).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, sent: 2, total: 2, failed: 0 })
    );
  });

  it("replaces {fname} template placeholder in per-recipient messages", async () => {
    sendNotifySMS.mockResolvedValue({ status: "sent" });
    const req = {
      body: {
        recipients: [{ to: "0711111111", fname: "Alice", message: "Hi {fname}!" }],
      },
      originalUrl: "/notify/bulk",
    };
    const res = makeRes();
    await sendNotifyBulkSMS(req, res);
    const callArgs = sendNotifySMS.mock.calls[0][0];
    expect(callArgs.message).toBe("Hi Alice!");
  });

  it("reports partial failures — ok:false when ALL fail", async () => {
    sendNotifySMS.mockRejectedValue(new Error("Provider down"));
    const req = {
      body: { recipients: [{ to: "0711111111" }], message: "Alert" },
      originalUrl: "/notify/bulk",
    };
    const res = makeRes();
    await sendNotifyBulkSMS(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(false);
    expect(payload.failed).toBe(1);
  });
});
