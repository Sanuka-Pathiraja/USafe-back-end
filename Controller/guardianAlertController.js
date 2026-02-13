// Handles real-time alerts when the child reaches a checkpoint
import { sendSingleSMS } from "../CallFeat/quicksend.js";
export async function sendCheckpointAlert(req, res) {
  try {
    const { routeName, checkpointName, status, parentPhone } = req.body;

    if (!routeName || !checkpointName || !status) {
      return res.status(400).json({ error: "Missing routeName/checkpointName/status" });
    }

    console.log(
      `🚨 ALERT REQUEST: Child '${status}' at ${checkpointName} (Route: ${routeName})`
    );

    let message = "";
    if (status === "arrived") {
      message = `SafePath: Your child has arrived safely at ${checkpointName}.`;
    } else if (status === "danger") {
      message = `URGENT: SafePath Alert! Child stopped unexpectedly near ${checkpointName}.`;
    } else {
      message = `SafePath: Child has reached ${checkpointName}.`;
    }

    // Try to send real SMS if phone and credentials exist
    if (parentPhone && process.env.QUICKSEND_API_KEY) {
      try {
        const senderID = process.env.SOS_SENDER_ID || "QKSendDemo";
        const smsResponse = await sendSingleSMS(parentPhone, message, senderID);

        console.log(`✅ SMS SENT to ${parentPhone}`);
        return res.status(200).json({ success: true, method: "REAL_SMS", smsResponse });
      } catch (smsError) {
        // Failover: Log error but return success with simulation fallback
        console.error(
          "⚠️ SMS API Failed (Switching to Simulation):",
          smsError.message
        );
        console.log(`[SIMULATION LOG] To: ${parentPhone} | Msg: ${message}`);

        return res.status(200).json({
          success: true,
          method: "SIMULATION_FALLBACK",
          warning: "Real SMS failed, but system handled it.",
        });
      }
    }

    // No phone or credentials - use simulation mode
    console.log(`[SIMULATION] To: ${parentPhone || "N/A"} | Msg: ${message}`);
    return res.status(200).json({ success: true, method: "SIMULATION" });
  } catch (error) {
    console.error("❌ CRITICAL ERROR:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
