import crypto from "crypto";

export function generatePayHereHash(merchantId, orderId, amount, currency, merchantSecret) {
  const secretHash = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();

  return crypto
    .createHash("md5")
    .update(merchantId + orderId + amount + currency + secretHash)
    .digest("hex")
    .toUpperCase();
}
