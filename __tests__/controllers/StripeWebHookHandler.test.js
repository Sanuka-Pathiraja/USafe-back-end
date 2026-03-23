import { describe, it, expect, vi, beforeEach } from "vitest";

// Build shared mock instances with vi.hoisted so they're available in mock factories
const { mockConstructEvent, mockSupabaseInsert } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSupabaseInsert: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

// Mock Stripe — no real signature verification or API calls
vi.mock("stripe", () => {
  function StripeMock() {
    return {
      webhooks: { constructEvent: mockConstructEvent },
    };
  }
  return { default: StripeMock };
});

// Mock Supabase — no real database writes
vi.mock("../../config/supabase.js", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({ insert: mockSupabaseInsert }),
  },
}));

import { handleStripeWebhook } from "../../Controller/StripeWebHookHandler.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NODE_ENV;
});

describe("handleStripeWebhook", () => {
  describe("development mode (skips signature verification)", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("inserts a payment record for checkout.session.completed event", async () => {
      mockSupabaseInsert.mockResolvedValue({ data: [{}], error: null });
      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_123",
            metadata: { user_id: "42" },
            amount_total: 16000,
            currency: "lkr",
          },
        },
      };
      const req = { body: event, headers: {} };
      const res = makeRes();
      await handleStripeWebhook(req, res);
      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ stripe_id: "cs_123", status: "paid" }),
        ])
      );
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it("inserts a payment record for payment_intent.succeeded event", async () => {
      mockSupabaseInsert.mockResolvedValue({ data: [{}], error: null });
      const event = {
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_456",
            metadata: { user_id: "42" },
            amount: 16000,
            currency: "lkr",
            status: "succeeded",
          },
        },
      };
      const req = { body: event, headers: {} };
      const res = makeRes();
      await handleStripeWebhook(req, res);
      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ stripe_id: "pi_456", status: "succeeded" }),
        ])
      );
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it("still returns received:true for unhandled event types", async () => {
      const event = { type: "customer.created", data: { object: {} } };
      const req = { body: event, headers: {} };
      const res = makeRes();
      await handleStripeWebhook(req, res);
      expect(mockSupabaseInsert).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe("production mode (verifies Stripe signature)", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("returns 400 when signature verification fails", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("No signatures found matching the expected signature");
      });
      const req = {
        body: Buffer.from("{}"),
        headers: { "stripe-signature": "invalid-sig" },
      };
      const res = makeRes();
      await handleStripeWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith("Webhook Error");
    });

    it("processes the event when signature is valid", async () => {
      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_valid",
            metadata: { user_id: "1" },
            amount_total: 5000,
            currency: "lkr",
          },
        },
      };
      mockConstructEvent.mockReturnValue(event);
      mockSupabaseInsert.mockResolvedValue({ data: [{}], error: null });
      const req = {
        body: Buffer.from(JSON.stringify(event)),
        headers: { "stripe-signature": "valid-sig" },
      };
      const res = makeRes();
      await handleStripeWebhook(req, res);
      expect(mockSupabaseInsert).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });
  });
});
