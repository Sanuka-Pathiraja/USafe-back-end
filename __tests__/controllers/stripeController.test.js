import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stripe — no real API calls
const { mockPaymentIntentsCreate } = vi.hoisted(() => ({
  mockPaymentIntentsCreate: vi.fn(),
}));

vi.mock("stripe", () => {
  function StripeMock() {
    return {
      paymentIntents: { create: mockPaymentIntentsCreate },
    };
  }
  return { default: StripeMock };
});

import { makePayment } from "../../Controller/stripeController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("makePayment", () => {
  it("creates a payment intent and returns clientSecret and paymentIntentId", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({
      client_secret: "pi_secret_abc",
      id: "pi_abc123",
    });

    const req = { user: { id: 42 }, body: { amount: 160 } };
    const res = makeRes();
    await makePayment(req, res);

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
      amount: 16000, // 160 * 100
      currency: "usd",
      payment_method_types: ["card"],
      metadata: { user_id: 42 },
    });
    expect(res.json).toHaveBeenCalledWith({
      clientSecret: "pi_secret_abc",
      paymentIntentId: "pi_abc123",
    });
  });

  it("converts amount to cents (multiplies by 100)", async () => {
    mockPaymentIntentsCreate.mockResolvedValue({ client_secret: "s", id: "i" });

    const req = { user: { id: 1 }, body: { amount: 50 } };
    const res = makeRes();
    await makePayment(req, res);

    const callArgs = mockPaymentIntentsCreate.mock.calls[0][0];
    expect(callArgs.amount).toBe(5000);
  });

  it("returns 500 when Stripe throws an error", async () => {
    mockPaymentIntentsCreate.mockRejectedValue(new Error("Card declined"));

    const req = { user: { id: 1 }, body: { amount: 100 } };
    const res = makeRes();
    await makePayment(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Card declined" });
  });
});
