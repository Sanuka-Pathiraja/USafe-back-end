import { sendBulkSameSMS } from "../CallFeat/quicksend.js";

const DISABLE_BULK_SMS = process.env.DISABLE_BULK_SMS === "true";

function parseTargets(input) {
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function maskPhone(raw) {
  const s = String(raw || "").replace(/\s+/g, "");
  if (!s) return null;
  return `******${s.slice(-3)}`;
}

export async function sendBulkSms(req, res) {
  if (DISABLE_BULK_SMS) {
    return res.status(503).json({
      message: "Bulk SMS feature is disabled (DISABLE_BULK_SMS=true)",
    });
  }

  try {
    const to = parseTargets(req.body?.to ?? process.env.SOS_BULK_TO ?? "");
    const msg = req.body?.msg || process.env.SOS_MESSAGE || "SOS! Immediate help needed.";
    const senderID = req.body?.senderID || process.env.SOS_SENDER_ID || "QKSendDemo";

    if (to.length === 0) {
      return res.status(400).json({
        message: "Provide 'to' as an array/CSV (or set SOS_BULK_TO in .env)",
      });
    }

    console.log(
      JSON.stringify({
        event: "BULK_SMS_SEND_REQUEST",
        route: req.originalUrl,
        total: to.length,
        to: to.map(maskPhone),
        senderID,
        ts: new Date().toISOString(),
      })
    );

    const response = await sendBulkSameSMS(to, msg, senderID);

    console.log(
      JSON.stringify({
        event: "BULK_SMS_SEND_SUCCESS",
        route: req.originalUrl,
        total: to.length,
        ts: new Date().toISOString(),
      })
    );

    return res.status(200).json({
      message: "Bulk SOS SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "BULK_SMS_SEND_FAILED",
        route: req.originalUrl,
        error: error.message,
        ts: new Date().toISOString(),
      })
    );

    return res.status(500).json({
      message: "Failed to send Bulk SOS SMS",
      error: error.message,
    });
  }
}
