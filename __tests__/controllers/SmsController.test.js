import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SMS provider — no real SMS ever sent
vi.mock("../../CallFeat/quicksend.js", () => ({
  sendSingleSMS: vi.fn(),
  checkBalance: vi.fn(),
}));

import { sendSingleSMS, checkBalance } from "../../CallFeat/quicksend.js";
import { sendSms, getBalance } from "../../Controller/SmsController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

// ─── sendSms ──────────────────────────────────────────────────────────────────

describe("sendSms", () => {
  it("returns 400 when 'to' field is missing and SOS_SMS_TO env is not set", async () => {
    delete process.env.SOS_SMS_TO;
    const req = { body: {}, originalUrl: "/sms/send" };
    const res = makeRes();
    await sendSms(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Missing required field 'to'") })
    );
  });

  it("sends SMS and returns 200 on success", async () => {
    sendSingleSMS.mockResolvedValue({ messageId: "msg-001" });
    const req = { body: { to: "0711111111", msg: "Help!" }, originalUrl: "/sms/send" };
    const res = makeRes();
    await sendSms(req, res);
    expect(sendSingleSMS).toHaveBeenCalledWith("0711111111", "Help!", expect.any(String));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "SOS SMS sent successfully" }));
  });

  it("returns 500 when the provider throws an error", async () => {
    sendSingleSMS.mockRejectedValue(new Error("Network error"));
    const req = { body: { to: "0711111111" }, originalUrl: "/sms/send" };
    const res = makeRes();
    await sendSms(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to send SOS SMS" })
    );
  });
});

// ─── getBalance ───────────────────────────────────────────────────────────────

describe("getBalance", () => {
  it("returns balance from the provider and 200 on success", async () => {
    checkBalance.mockResolvedValue({ balance: "LKR 150.00" });
    const req = {};
    const res = makeRes();
    await getBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Balance retrieved" })
    );
  });

  it("returns 500 when the provider throws", async () => {
    checkBalance.mockRejectedValue(new Error("Auth failed"));
    const req = {};
    const res = makeRes();
    await getBalance(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to check balance" })
    );
  });
});
