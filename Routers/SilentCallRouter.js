import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { submitSilentCall } from "../Controller/SilentCallController.js";

const router = Router();

router.post("/emergency/silent-call", authMiddleware, submitSilentCall);
router.post("/contact/silent-call", authMiddleware, submitSilentCall);
router.post("/emergency/contacts/silent-call", authMiddleware, submitSilentCall);

export default router;
