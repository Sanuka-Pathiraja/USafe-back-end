import express from "express";
const router = express.Router();

import { getSafeRoute, getDangerZones } from "../Controller/safeRouteController.js";

router.get("/safe-route", getSafeRoute);
router.get("/danger-zones", getDangerZones);

export default router;
