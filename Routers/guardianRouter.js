import { Router } from "express";
import { getSafetyScore } from "../Controller/guardianController.js";
import { createGuardianRoute, listGuardianRoutes } from "../Controller/guardianRoutesController.js";
import { sendCheckpointAlert } from "../Controller/guardianAlertController.js";

const router = Router();

// Lightweight request logger for SafePath debugging
router.use((req, res, next) => {
	console.log(`[GUARDIAN] ${req.method} ${req.originalUrl}`);
	next();
});

router.get("/safety-score", getSafetyScore);
router.post("/alert", sendCheckpointAlert);
router.post("/routes", createGuardianRoute);
router.get("/routes", listGuardianRoutes);

export default router;
