import Stripe from "stripe";
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch (error) {
    console.warn("⚠️ Failed to initialize Stripe client:", error.message);
  }
} else {
  console.warn("⚠️ STRIPE_SECRET_KEY is missing. Payment features will be disabled.");
}

export const createCheckoutSession = async (req, res) => {
  try {
    const { amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "lkr", // Fixed: Correct currency
            product_data: {
              name: "uSafe Premium Upgrade",
            },
            unit_amount: amount * 100, // 160 LKR becomes 16000
          },
          quantity: 1,
        },
      ],
      success_url: "http://10.0.2.2:5000/payment/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://10.0.2.2:5000/payment/cancel",
      metadata: {
        user_id: req.user.id,
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("❌ Stripe Checkout error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
