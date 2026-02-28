import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { startEmergencyProcess, getEmergencyProcessStatus } from "../Controller/EmergencyProcessStubs.js";

const router = Router();

router.post("/emergency/process/start", authMiddleware, startEmergencyProcess);
router.get("/emergency/process/:sessionId/status", authMiddleware, getEmergencyProcessStatus);

export default router;
