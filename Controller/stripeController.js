import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const makePayment = async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "usd",

      metadata: {
        user_id: req.user.id,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default makePayment;
