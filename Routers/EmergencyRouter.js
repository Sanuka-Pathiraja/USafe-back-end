import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  startEmergency,
  startCallToContact,
  attemptCallToContact,
  cancelEmergency,
  finishEmergency,
  callEmergencyServices,
  getCallStatus,
  getEmergencyStatus,
  voiceEventWebhook,
  devMarkAnswered,
  devResetSession,
} from "../Controller/EmergencyProcessController.js";

const router = Router();

// App endpoints (auth)
router.post("/emergency/start", authMiddleware, startEmergency);
router.post("/emergency/:sessionId/call/:contactIndex/start", authMiddleware, startCallToContact);
router.post("/emergency/:sessionId/call/:contactIndex/attempt", authMiddleware, attemptCallToContact);
router.post("/emergency/:sessionId/cancel", authMiddleware, cancelEmergency);
router.post("/emergency/:sessionId/finish", authMiddleware, finishEmergency);
router.post("/emergency/:sessionId/call-119", authMiddleware, callEmergencyServices);
router.get("/emergency/:sessionId/call/:callId/status", authMiddleware, getCallStatus);
router.get("/emergency/:sessionId/status", authMiddleware, getEmergencyStatus);

// Vonage webhook (no auth)
router.post("/webhooks/voice-event", voiceEventWebhook);

// Demo endpoints (auth)
router.post("/emergency/:sessionId/dev/mark-answered", authMiddleware, devMarkAnswered);
router.post("/emergency/:sessionId/dev/reset", authMiddleware, devResetSession);

export default router;
