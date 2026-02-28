import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { calculateSafetyScore } from "../Controller/SafetyScoreController.js";

const router = Router();

router.post("/safety-score", authMiddleware, calculateSafetyScore);

export default router;
