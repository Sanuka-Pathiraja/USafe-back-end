import { Router } from "express";
import { getSafetyScore } from "../Controller/guardianController.js";
import { getPublicTripTracking } from "../Controller/TripController.js";
import { createGuardianRoute, listGuardianRoutes } from "../Controller/guardianRoutesController.js";
import { sendCheckpointAlert } from "../Controller/guardianAlertController.js";
import { trackGuardianProgress } from "../Controller/guardianTrackingController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

// Lightweight request logger for SafePath debugging
router.use((req, res, next) => {
	console.log(`[GUARDIAN] ${req.method} ${req.originalUrl}`);
	next();
});

// Safety score is public (read-only calculation, rate-limited)
router.get("/safety-score", getSafetyScore);
// Public tracking endpoint for contact-shared SafePath links.
router.get("/tracking", getPublicTripTracking);
router.get("/tracking/:trackingId", getPublicTripTracking);

// Protected endpoints require authentication
router.post("/alert", authMiddleware, sendCheckpointAlert);
router.post("/routes", authMiddleware, createGuardianRoute);
router.get("/routes", authMiddleware, listGuardianRoutes);
router.post("/track", authMiddleware, trackGuardianProgress);

export default router;
