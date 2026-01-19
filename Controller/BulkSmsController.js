import { sendBulkSameSMS } from "../CallFeat/quicksend.js";

const DISABLE_BULK_SMS = process.env.DISABLE_BULK_SMS === "true";

export async function sendBulkSms(req, res) {
  if (DISABLE_BULK_SMS) {
    return res.status(503).json({
      message: "Bulk SMS feature is disabled (DISABLE_BULK_SMS=true)",
    });
  }

  try {
    const { to, msg, senderID } = req.body;
    const response = await sendBulkSameSMS(to, msg, senderID);
    res.status(200).json({
      message: "Bulk SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error("Bulk SMS failed:", error.message);
    res.status(500).json({
      message: "Failed to send Bulk SMS",
      error: error.message,
    });
  }
}
