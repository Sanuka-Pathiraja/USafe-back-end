import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SMS provider — no real SMS ever sent
vi.mock("../../CallFeat/quicksend.js", () => ({
  sendBulkSameSMS: vi.fn(),
}));

import { sendBulkSameSMS } from "../../CallFeat/quicksend.js";
import { sendBulkSms } from "../../Controller/BulkSmsController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("sendBulkSms", () => {
  it("returns 400 when 'to' is empty and SOS_BULK_TO env is not set", async () => {
    delete process.env.SOS_BULK_TO;
    const req = { body: {}, originalUrl: "/sms/bulk" };
    const res = makeRes();
    await sendBulkSms(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Provide 'to'") })
    );
  });

  it("accepts an array of recipients and sends bulk SMS", async () => {
    sendBulkSameSMS.mockResolvedValue({ sent: 2 });
    const req = {
      body: { to: ["0711111111", "0722222222"], msg: "Emergency!" },
      originalUrl: "/sms/bulk",
    };
    const res = makeRes();
    await sendBulkSms(req, res);
    expect(sendBulkSameSMS).toHaveBeenCalledWith(
      ["0711111111", "0722222222"],
      "Emergency!",
      expect.any(String)
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Bulk SOS SMS sent successfully" })
    );
  });

  it("accepts a CSV string of recipients", async () => {
    sendBulkSameSMS.mockResolvedValue({ sent: 2 });
    const req = {
      body: { to: "0711111111,0722222222", msg: "Alert!" },
      originalUrl: "/sms/bulk",
    };
    const res = makeRes();
    await sendBulkSms(req, res);
    expect(sendBulkSameSMS).toHaveBeenCalledWith(
      ["0711111111", "0722222222"],
      "Alert!",
      expect.any(String)
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 when the provider throws an error", async () => {
    sendBulkSameSMS.mockRejectedValue(new Error("Service unavailable"));
    const req = { body: { to: ["0711111111"] }, originalUrl: "/sms/bulk" };
    const res = makeRes();
    await sendBulkSms(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to send Bulk SOS SMS" })
    );
  });
});
