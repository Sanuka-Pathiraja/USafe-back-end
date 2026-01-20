import { sendSingleSMS, checkBalance } from "../CallFeat/quicksend.js";

const DISABLE_SMS = process.env.DISABLE_SMS === "true";

export async function sendSms(req, res) {
  if (DISABLE_SMS) {
    return res.status(503).json({
      message: "SMS feature is disabled (DISABLE_SMS=true)",
    });
  }

  try {
    const to = (process.env.SOS_SMS_TO || "").trim();
    const msg = process.env.SOS_MESSAGE || "🚨 SOS! Immediate help needed.";
    const senderID = process.env.SOS_SENDER_ID || "QKSendDemo";

    if (!to) {
      return res.status(500).json({
        message: "Server configuration error: SOS_SMS_TO is not set in .env",
      });
    }

    const response = await sendSingleSMS(to, msg, senderID);

    return res.status(200).json({
      message: "SOS SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error("SMS failed:", error.message);
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
