// Routers/EmergencyRouter.js
import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  startEmergency,
  startCallToContact,
  getCallStatus,
  voiceEventWebhook,
  getEmergencyStatus,
} from "../Controller/EmergencyController.js";

const router = Router();

// App endpoints (auth)
router.post("/emergency/start", authMiddleware, startEmergency);
router.post("/emergency/:sessionId/call/:contactIndex/start", authMiddleware, startCallToContact);
router.get("/emergency/:sessionId/call/:callId/status", authMiddleware, getCallStatus);
router.get("/emergency/:sessionId/status", authMiddleware, getEmergencyStatus);

// Vonage webhook (no auth)
router.post("/webhooks/voice-event", voiceEventWebhook);

export default router;
