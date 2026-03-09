import makeOutboundCall from "../CallFeat/voiceService.js";
import { normalizeNum } from "../utils/normalizeNumberFormat.js";

const DISABLE_CALLS = process.env.DISABLE_CALLS === "true";
const ALLOW_DEV_CUSTOM_CALL_TARGET = process.env.ALLOW_DEV_CUSTOM_CALL_TARGET === "true";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export async function initiateCall(req, res) {
  if (DISABLE_CALLS) {
    return res.status(503).json({
      message: "Call feature is disabled (DISABLE_CALLS=true)",
    });
  }

  try {
    const configuredTo = (process.env.SOS_CALL_TO || "").trim();
    const hasCustomTarget = typeof req.body?.to === "string" && req.body.to.trim().length > 0;
    let requestedTo = null;

    if (hasCustomTarget && IS_PRODUCTION) {
      return res.status(403).json({
        message: "Custom call target is not allowed in production",
      });
    }

    if (hasCustomTarget && !ALLOW_DEV_CUSTOM_CALL_TARGET) {
      return res.status(403).json({
        message: "Custom call target is disabled. Set ALLOW_DEV_CUSTOM_CALL_TARGET=true for local testing",
      });
    }

    if (hasCustomTarget) {
      try {
        requestedTo = normalizeNum(req.body?.to);
      } catch {
        return res.status(400).json({
          message: "Invalid 'to' number. Use LK mobile format (94XXXXXXXXX / 07XXXXXXXX / +94XXXXXXXXX)",
        });
      }
    }

    const to = requestedTo || configuredTo;

    if (!to) {
      return res.status(500).json({
        message: "Server configuration error: SOS_CALL_TO is not set in .env",
      });
    }

    const response = await makeOutboundCall(to);

    return res.status(200).json({
      message: "Call initiated successfully",
      data: response,
    });
  } catch (error) {
    console.error("Call failed:", error.message);
    return res.status(500).json({
      message: "Failed to make call",
      error: error.message,
    });
  }
}
