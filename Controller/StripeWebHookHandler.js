import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

import { supabase } from "../config/supabase.js";

export const handleStripeWebhook = async (req, res) => {
  let event;

  // DEV MODE: skip signature verification for Postman testing
  if (process.env.NODE_ENV === "development") {
    // express.raw stores raw body buffer, parse it to JSON
    if (typeof req.body === "string") {
      event = JSON.parse(req.body);
    } else {
      event = req.body;
    }
  } else {
    // PRODUCTION MODE: verify Stripe signature

    const sig = req.headers["stripe-signature"];
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.log("❌ Webhook error:", err.message);
      return res.status(400).send("Webhook Error");
    }
  }

  // Handle successful payment
  if (event.type === "payment_intent.succeeded") {
    const payment = event.data.object;

    await supabase.from("payments").insert([
      {
        user_id: payment.metadata.user_id,
        stripe_id: payment.id,
        amount: payment.amount / 100,
        status: payment.status,
      },
    ]);
  }

  res.json({ received: true });
};
