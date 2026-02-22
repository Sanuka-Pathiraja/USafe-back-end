import { Router } from "express";
import { getHealthStatus, getLiveness, getReadiness } from "../Controller/healthController.js";

const router = Router();

router.get("/health", getHealthStatus);
router.get("/health/live", getLiveness);
router.get("/health/ready", getReadiness);

export default router;
