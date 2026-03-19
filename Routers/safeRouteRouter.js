import express from "express";
import { getSafeRoute } from "../Controller/safeRouteController.js";

const router = express.Router();

router.get("/safe-route", getSafeRoute);
router.post("/safe-route", getSafeRoute);

export default router;
