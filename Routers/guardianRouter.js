import { Router } from "express";
import crypto from "crypto";
import { getSafetyScore, getGuardianSelfCheck } from "../Controller/guardianController.js";
import { getPublicTripTracking } from "../Controller/TripController.js";
import { createGuardianRoute, listGuardianRoutes } from "../Controller/guardianRoutesController.js";
import { sendCheckpointAlert } from "../Controller/guardianAlertController.js";
import { trackGuardianProgress } from "../Controller/guardianTrackingController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { generousLimiter, trackingPublicLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.use((req, res, next) => {
	const incomingRequestId = String(req.headers["x-request-id"] || "").trim();
	req.requestId = incomingRequestId || crypto.randomUUID();
	res.setHeader("x-request-id", req.requestId);
	next();
});

// Lightweight request logger for SafePath debugging
router.use((req, res, next) => {
	console.log(`[GUARDIAN][${req.requestId}] ${req.method} ${req.originalUrl}`);
	next();
});

// Public read-only endpoint for coordinate-based safety scoring.
router.get("/safety-score", generousLimiter, getSafetyScore);
router.post("/safety-score", generousLimiter, getSafetyScore);
// Public tracking endpoints for contact-shared SafePath links.
// Supports both /tracking/:trackingId and /tracking?trackingId=... forms.
router.get("/tracking", trackingPublicLimiter, getPublicTripTracking);
router.get("/tracking/:trackingId", trackingPublicLimiter, getPublicTripTracking);

// Protected Guardian operations require authentication.
router.get("/self-check", authMiddleware, getGuardianSelfCheck);
router.post("/alert", authMiddleware, sendCheckpointAlert);
router.post("/routes", authMiddleware, createGuardianRoute);
router.get("/routes", authMiddleware, listGuardianRoutes);
router.post("/track", authMiddleware, trackGuardianProgress);

export default router;
