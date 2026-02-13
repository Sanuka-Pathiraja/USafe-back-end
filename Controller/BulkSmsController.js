import { sendBulkSameSMS } from "../CallFeat/quicksend.js";

const DISABLE_BULK_SMS = process.env.DISABLE_BULK_SMS === "true";

export async function sendBulkSms(req, res) {
  if (DISABLE_BULK_SMS) {
    return res.status(503).json({
      message: "Bulk SMS feature is disabled (DISABLE_BULK_SMS=true)",
    });
  }

  try {
    const raw = process.env.SOS_BULK_TO || "";
    const to = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const msg = process.env.SOS_MESSAGE || "🚨 SOS! Immediate help needed.";
    const senderID = process.env.SOS_SENDER_ID || "QKSendDemo";

    if (to.length === 0) {
      return res.status(500).json({
        message: "Server configuration error: SOS_BULK_TO is not set in .env",
      });
    }

    const response = await sendBulkSameSMS(to, msg, senderID);

    return res.status(200).json({
      message: "Bulk SOS SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error("Bulk SMS failed:", error.message);
    return res.status(500).json({
      message: "Failed to send Bulk SOS SMS",
      error: error.message,
    });
  }
}
