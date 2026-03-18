import express from "express";
const router = express.Router();

import { getSafeRoute } from "../Controller/safeRouteController.js";

router.get("/safe-route", getSafeRoute);

export default router;