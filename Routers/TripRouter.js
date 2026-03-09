import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  startTrip,
  markTripSafe,
  addTripTime,
  updateTripLocation,
  getTripDebugState,
} from "../Controller/TripController.js";

const router = Router();

router.post("/start", authMiddleware, startTrip);
router.post("/safe", authMiddleware, markTripSafe);
router.post("/add-time", authMiddleware, addTripTime);
router.post("/location-update", authMiddleware, updateTripLocation);

// Optional debug endpoint for validating server-side timers.
router.get("/status", authMiddleware, getTripDebugState);

export default router;
