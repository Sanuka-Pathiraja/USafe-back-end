import { sendSingleSMS, checkBalance } from "../CallFeat/quicksend.js";

const DISABLE_SMS = process.env.DISABLE_SMS === "true";

function maskPhone(raw) {
  const s = String(raw || "").replace(/\s+/g, "");
  if (!s) return null;
  return `******${s.slice(-3)}`;
}

export async function sendSms(req, res) {
  if (DISABLE_SMS) {
    return res.status(503).json({
      message: "SMS feature is disabled (DISABLE_SMS=true)",
    });
  }

  try {
    const to = (req.body?.to || process.env.SOS_SMS_TO || "").trim();
    const msg = req.body?.msg || process.env.SOS_MESSAGE || "SOS! Immediate help needed.";
    const senderID = req.body?.senderID || process.env.SOS_SENDER_ID || "QKSendDemo";

    if (!to) {
      return res.status(400).json({
        message: "Missing required field 'to' (or set SOS_SMS_TO in .env)",
      });
    }

    console.log(
      JSON.stringify({
        event: "SMS_SEND_REQUEST",
        route: req.originalUrl,
        to: maskPhone(to),
        senderID,
        ts: new Date().toISOString(),
      })
    );

    const response = await sendSingleSMS(to, msg, senderID);

    console.log(
      JSON.stringify({
        event: "SMS_SEND_SUCCESS",
        route: req.originalUrl,
        to: maskPhone(to),
        ts: new Date().toISOString(),
      })
    );

    return res.status(200).json({
      message: "SOS SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "SMS_SEND_FAILED",
        route: req.originalUrl,
        error: error.message,
        ts: new Date().toISOString(),
      })
    );

    return res.status(500).json({
      message: "Failed to send SOS SMS",
      error: error.message,
    });
  }
}

export async function getBalance(req, res) {
  try {
    const balance = await checkBalance();
    return res.status(200).json({
      message: "Balance retrieved",
      data: balance,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to check balance",
      error: error.message,
    });
  }
}
