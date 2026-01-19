import { sendSingleSMS, checkBalance } from "../CallFeat/quicksend.js";

const DISABLE_SMS = process.env.DISABLE_SMS === "true";

export async function sendSms(req, res) {
  if (DISABLE_SMS) {
    return res.status(503).json({
      message: "SMS feature is disabled (DISABLE_SMS=true)",
    });
  }

  try {
    const { to, msg, senderID } = req.body;
    const response = await sendSingleSMS(to, msg, senderID);
    res.status(200).json({
      message: "SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error("SMS failed:", error.message);
    res.status(500).json({
      message: "Failed to send SMS",
      error: error.message,
    });
  }
}

export async function getBalance(req, res) {
  try {
    const balance = await checkBalance();
    res.status(200).json({
      message: "Balance retrieved",
      data: balance,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to check balance",
      error: error.message,
    });
  }
}
