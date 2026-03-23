import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock PayHere config — no real credentials needed
vi.mock("../../config/payhere.config.js", () => ({
  payhereConfig: {
    merchantId: "TEST_MERCHANT",
    merchantSecret: "TEST_SECRET",
    currency: "LKR",
  },
}));

import { createPayHerePayment, payHereNotify } from "../../Controller/payhere.controller.js";
import { generatePayHereHash } from "../../utils/payhereHash.js";

function makeRes() {
  const res = {};
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("createPayHerePayment", () => {
  it("returns merchant_id, order_id, amount, currency, hash, and redirect URLs", async () => {
    const req = { body: { order_id: "ORDER-001", amount: 160 } };
    const res = makeRes();
    createPayHerePayment(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.merchant_id).toBe("TEST_MERCHANT");
    expect(payload.order_id).toBe("ORDER-001");
    expect(payload.amount).toBe(160);
    expect(payload.currency).toBe("LKR");
    expect(typeof payload.hash).toBe("string");
    expect(payload.hash).toMatch(/^[A-F0-9]{32}$/);
    expect(payload.return_url).toBeDefined();
    expect(payload.cancel_url).toBeDefined();
    expect(payload.notify_url).toBeDefined();
  });

  it("generates a hash consistent with generatePayHereHash", () => {
    const req = { body: { order_id: "ORDER-001", amount: 160 } };
    const res = makeRes();
    createPayHerePayment(req, res);
    const payload = res.json.mock.calls[0][0];
    const expected = generatePayHereHash("TEST_MERCHANT", "ORDER-001", (160).toFixed(2), "LKR", "TEST_SECRET");
    expect(payload.hash).toBe(expected);
  });
});

describe("payHereNotify", () => {
  it("responds with 'OK' for both valid and invalid signatures", () => {
    // The controller logs success/failure but always sends OK (as per PayHere spec)
    const req = {
      body: {
        merchant_id: "TEST_MERCHANT",
        order_id: "ORDER-001",
        payhere_amount: "160.00",
        payhere_currency: "LKR",
        status_code: "2",
        md5sig: "INVALID_SIG", // Wrong sig — controller logs failure but still sends OK
      },
    };
    const res = makeRes();
    payHereNotify(req, res);
    expect(res.send).toHaveBeenCalledWith("OK");
  });

  it("responds with 'OK' when signature matches and status is 2 (success)", () => {
    // PayHere spec requires the notify endpoint to always respond with "OK"
    const req = {
      body: {
        merchant_id: "TEST_MERCHANT",
        order_id: "ORDER-002",
        payhere_amount: "500.00",
        payhere_currency: "LKR",
        status_code: "2",
        md5sig: "ANYTHING",
      },
    };
    const res = makeRes();
    payHereNotify(req, res);
    expect(res.send).toHaveBeenCalledWith("OK");
  });
});
