import { Router } from "express";
import { sendEmergencyNotifications } from "../Controller/NotifyLkSmsController.js";

const router = Router();

router.post("/emergency/:sessionId/notify", sendEmergencyNotifications);

export default router;
