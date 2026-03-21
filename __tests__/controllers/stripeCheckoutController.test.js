import { describe, it, expect, vi, beforeEach } from "vitest";

// Build a shared mock instance accessible in tests, using vi.hoisted so
// the variables are available when vi.mock factories are evaluated.
const { mockSessionCreate } = vi.hoisted(() => ({
  mockSessionCreate: vi.fn(),
}));

// Mock Stripe — no real payment API calls made
vi.mock("stripe", () => {
  function StripeMock() {
    return {
      checkout: { sessions: { create: mockSessionCreate } },
    };
  }
  return { default: StripeMock };
});

import { createCheckoutSession } from "../../Controller/stripeCheckoutController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("createCheckoutSession", () => {
  it("creates a Stripe checkout session and returns the URL on success", async () => {
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });
    const req = { user: { id: 42 }, body: { amount: 160 } };
    const res = makeRes();
    await createCheckoutSession(req, res);
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        metadata: { user_id: 42 },
      })
    );
    expect(res.json).toHaveBeenCalledWith({ checkoutUrl: "https://checkout.stripe.com/session123" });
  });

  it("returns 500 when Stripe throws an error", async () => {
    mockSessionCreate.mockRejectedValue(new Error("Invalid API key"));
    const req = { user: { id: 42 }, body: { amount: 160 } };
    const res = makeRes();
    await createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid API key" })
    );
  });

  it("sets the line item amount as amount * 100 (converts to cents)", async () => {
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
    const req = { user: { id: 1 }, body: { amount: 200 } };
    const res = makeRes();
    await createCheckoutSession(req, res);
    const callArgs = mockSessionCreate.mock.calls[0][0];
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(20000); // 200 * 100
  });
});
