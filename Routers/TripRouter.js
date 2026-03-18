import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  startTrip,
  updateLocation,
  addTime,
  endTripSafe,
  triggerSOS,
} from "../Controller/TripController.js";

const router = Router();

// SafePath session endpoints; all routes require a valid JWT.
router.post("/start", authMiddleware, startTrip);
router.put("/:tripId/location", authMiddleware, updateLocation);
router.put("/:tripId/add-time", authMiddleware, addTime);
router.post("/:tripId/end-safe", authMiddleware, endTripSafe);
router.post("/:tripId/sos", authMiddleware, triggerSOS);

export default router;
