// Handles real-time alerts when the child reaches a checkpoint
import { sendSingleSMS } from "../CallFeat/quicksend.js";
import AppDataSource from "../config/data-source.js";

const ALLOWED_STATUSES = new Set(["arrived", "danger", "checkpoint"]);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function normalizePhone(phone) {
  if (typeof phone !== "string") {
    return "";
  }
  return phone.trim();
}

function isSmsConfigured() {
  return Boolean(process.env.QUICKSEND_EMAIL && process.env.QUICKSEND_API_KEY);
}

function isLikelyPhoneNumber(value) {
  return /^\+?[0-9]{9,15}$/.test(String(value || "").trim());
}

export async function sendCheckpointAlert(req, res) {
  try {
    const { routeName, checkpointName, status } = req.body;
    let parentPhone = normalizePhone(req.body.parentPhone || req.user?.phone || "");
    const normalizedStatus = typeof status === "string" ? status.trim().toLowerCase() : "";

    if (!routeName || !checkpointName || !normalizedStatus) {
      return res.status(400).json({ error: "Missing routeName/checkpointName/status" });
    }

    if (!ALLOWED_STATUSES.has(normalizedStatus)) {
      return res.status(400).json({ error: "Invalid status. Use arrived, danger, or checkpoint." });
    }

    if (!parentPhone && req.user?.id) {
      const users = await AppDataSource.query(
        `SELECT phone FROM users WHERE id = $1 LIMIT 1`,
        [req.user.id]
      );
      parentPhone = normalizePhone(users?.[0]?.phone || "");
    }

    if (!parentPhone) {
      return res.status(400).json({ error: "parentPhone is required" });
    }
    if (!isLikelyPhoneNumber(parentPhone)) {
      return res.status(400).json({ error: "Invalid parentPhone format" });
    }

    console.log(
      `🚨 ALERT REQUEST: Child '${normalizedStatus}' at ${checkpointName} (Route: ${routeName})`
    );

    let message = "";
    if (normalizedStatus === "arrived") {
      message = `SafePath: Your child has arrived safely at ${checkpointName}.`;
    } else if (normalizedStatus === "danger") {
      message = `URGENT: SafePath Alert! Child stopped unexpectedly near ${checkpointName}.`;
    } else {
      message = `SafePath: Child has reached ${checkpointName}.`;
    }

    if (isSmsConfigured()) {
      try {
        const senderID = process.env.SOS_SENDER_ID || "QKSendDemo";
        const smsResponse = await sendSingleSMS(parentPhone, message, senderID);

        console.log(`✅ SMS SENT to ${parentPhone}`);
        return res.status(200).json({ success: true, method: "REAL_SMS", smsResponse });
      } catch (smsError) {
        console.error("❌ SMS API failed:", smsError.message);

        if (process.env.NODE_ENV === "production") {
          return res.status(502).json({
            error: "Failed to deliver guardian alert SMS",
          });
        }

        console.log(`[SIMULATION LOG] To: ${parentPhone} | Msg: ${message}`);
        return res.status(200).json({ success: true, method: "SIMULATION_FALLBACK" });
      }
    }

    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({
        error: "SMS provider is not configured",
      });
    }

    console.log(`[SIMULATION] To: ${parentPhone} | Msg: ${message}`);
    return res.status(200).json({ success: true, method: "SIMULATION" });
  } catch (error) {
    console.error("❌ CRITICAL ERROR:", error.message);
    return res.status(500).json({
      error: "Internal Server Error",
      ...(IS_PRODUCTION ? {} : { details: error.message }),
    });
  }
}
