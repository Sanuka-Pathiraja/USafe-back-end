import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
  try {
    const { amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      payment_method_types: ["card"],

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "uSafe Premium",
            },
            unit_amount: amount * 100,
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
