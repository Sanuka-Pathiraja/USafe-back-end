import makeOutboundCall from "../CallFeat/voiceService.js";

const DISABLE_CALLS = process.env.DISABLE_CALLS === "true";

export async function initiateCall(req, res) {
  if (DISABLE_CALLS) {
    return res.status(503).json({
      message: "Call feature is disabled (DISABLE_CALLS=true)",
    });
  }

  try {
    const response = await makeOutboundCall();
    res.status(200).json({
      message: "Call initiated successfully",
      data: response,
    });
  } catch (error) {
    console.error("Call failed:", error.message);
    res.status(500).json({
      message: "Failed to make call",
      error: error.message,
    });
  }
}
