// Handles real-time alerts when the child reaches a checkpoint
import { sendSingleSMS } from "../CallFeat/quicksend.js";
import { sendSms } from "../services/SmsService.js";
import AppDataSource from "../config/data-source.js";

const ALLOWED_STATUSES = new Set(["arrived", "danger", "checkpoint"]);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function normalizePhone(phone) {
  if (typeof phone !== "string") {
    return "";
  }
  return phone.trim().replace(/[\s\-().]/g, "");
}

function isSmsConfigured() {
  return Boolean(process.env.QUICKSEND_EMAIL && process.env.QUICKSEND_API_KEY);
}

function isLikelyPhoneNumber(value) {
  return /^\+?[0-9]{9,15}$/.test(normalizePhone(value || ""));
}

export async function sendCheckpointAlert(req, res) {
  try {
    const requestId = req.requestId || "n/a";
    const userId = req.user?.id;
    const { tripId, message: alertMessage } = req.body || {};

    // New Guardian flow: frontend sends tripId + message per checkpoint.
    if (tripId || alertMessage) {
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!tripId || !alertMessage) {
        return res.status(400).json({ error: "tripId and message are required" });
      }

      const tripRepo = AppDataSource.getRepository("TripSession");
      const trip = await tripRepo.findOneBy({ id: String(tripId), userId });
      if (!trip) {
        return res.status(404).json({ error: "Trip not found" });
      }

      const contactIds = Array.isArray(trip.contactIds) ? trip.contactIds : [];
      if (contactIds.length === 0) {
        return res.status(400).json({ error: "Trip has no contactIds" });
      }

      const contactRepo = AppDataSource.getRepository("Contact");
      const contacts = await contactRepo.find({
        where: contactIds.map((contactId) => ({
          contactId,
          user: { id: userId },
        })),
        select: {
          contactId: true,
          name: true,
          phone: true,
        },
      });

      const results = [];
      for (const contact of contacts) {
        const phone = normalizePhone(contact.phone || "");
        if (!isLikelyPhoneNumber(phone)) {
          results.push({
            contactId: contact.contactId,
            phone,
            ok: false,
            error: "Invalid phone number format",
          });
          continue;
        }

        try {
          const smsResult = await sendSms({ to: phone, body: String(alertMessage) });
          const ok = smsResult?.success === true;
          results.push({
            contactId: contact.contactId,
            phone,
            ok,
            result: smsResult,
            ...(ok ? {} : { error: smsResult?.message || "SMS not sent" }),
          });
        } catch (smsError) {
          results.push({
            contactId: contact.contactId,
            phone,
            ok: false,
            error: smsError?.message || "SMS send failed",
          });
        }
      }

      const sent = results.filter((r) => r.ok).length;
      const failed = results.length - sent;

      console.log(
        `[${requestId}] Guardian trip alert sent: tripId=${tripId} sent=${sent} failed=${failed}`
      );

      return res.status(200).json({
        success: true,
        tripId: String(tripId),
        sent,
        failed,
        results,
      });
    }

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
      `[${requestId}] 🚨 ALERT REQUEST: Child '${normalizedStatus}' at ${checkpointName} (Route: ${routeName})`
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

        console.log(`[${requestId}] ✅ SMS SENT to ${parentPhone}`);
        return res.status(200).json({ success: true, method: "REAL_SMS", smsResponse });
      } catch (smsError) {
        console.error("❌ SMS API failed:", {
          requestId,
          error: smsError.message,
        });

        if (process.env.NODE_ENV === "production") {
          return res.status(502).json({
            error: "Failed to deliver guardian alert SMS",
          });
        }

        console.log(`[SIMULATION LOG][${requestId}] To: ${parentPhone} | Msg: ${message}`);
        return res.status(200).json({ success: true, method: "SIMULATION_FALLBACK" });
      }
    }

    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({
        error: "SMS provider is not configured",
      });
    }

    console.log(`[SIMULATION][${requestId}] To: ${parentPhone} | Msg: ${message}`);
    return res.status(200).json({ success: true, method: "SIMULATION" });
  } catch (error) {
    console.error("❌ CRITICAL ERROR:", {
      requestId: req.requestId || "n/a",
      error: error.message,
    });
    return res.status(500).json({
      error: "Internal Server Error",
      requestId: req.requestId || null,
      ...(IS_PRODUCTION ? {} : { details: error.message }),
    });
  }
}
