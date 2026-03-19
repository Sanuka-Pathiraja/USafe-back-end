import { payhereConfig } from "../config/payhere.config.js";
import { generatePayHereHash } from "../utils/payhereHash.js";
import crypto from "crypto";

/* ============ CREATE PAYMENT ============ */
export const createPayHerePayment = (req, res) => {
  const { order_id, amount } = req.body;

  const hash = generatePayHereHash(payhereConfig.merchantId, order_id, amount.toFixed(2), payhereConfig.currency, payhereConfig.merchantSecret);

  res.json({
    merchant_id: payhereConfig.merchantId,
    order_id,
    amount,
    currency: payhereConfig.currency,
    hash,
    return_url: "http://localhost:3000/payment-success",
    cancel_url: "http://localhost:3000/payment-cancel",
    notify_url: "http://localhost:5000/payhere/notify",
  });
};

/* ============ PAYHERE NOTIFY ============ */
export const payHereNotify = (req, res) => {
  const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig } = req.body;

  const localSig = crypto
    .createHash("md5")
    .update(merchant_id + order_id + payhere_amount + payhere_currency + status_code + crypto.createHash("md5").update(payhereConfig.merchantSecret).digest("hex").toUpperCase())
    .digest("hex")
    .toUpperCase();

  if (localSig === md5sig && status_code === "2") {
    console.log("✅ PayHere payment SUCCESS:", order_id);
    // 👉 save SUCCESS in DB
  } else {
    console.log("❌ PayHere payment FAILED:", order_id);
    // 👉 save FAILED in DB
  }

  res.send("OK");
};
