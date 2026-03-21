import { sendSingleSMS } from "../CallFeat/quicksend.js";

const DISABLE_SMS = process.env.DISABLE_SMS === "true";
const SMS_CONFIGURED = Boolean(process.env.QUICKSEND_EMAIL && process.env.QUICKSEND_API_KEY);

export async function sendSms({ to, body, senderID } = {}) {
  if (DISABLE_SMS) {
    return { success: false, disabled: true, message: "SMS feature is disabled" };
  }
  if (!SMS_CONFIGURED) {
    return { success: false, disabled: true, message: "SMS provider is not configured" };
  }

  const normalizedTo = String(to || "").trim();
  const normalizedBody = String(body || "").trim();

  if (!normalizedTo) {
    throw new Error("sendSms: 'to' is required");
  }

  if (!normalizedBody) {
    throw new Error("sendSms: 'body' is required");
  }

  const sender = String(senderID || process.env.SOS_SENDER_ID || "QKSendDemo").trim();
  return sendSingleSMS(normalizedTo, normalizedBody, sender || "QKSendDemo");
}
