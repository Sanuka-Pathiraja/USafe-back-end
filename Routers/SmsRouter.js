import { Router } from "express";
import { sendSms, getBalance } from "../Controller/SmsController.js";

const router = Router();

router.post("/sms", sendSms);
router.get("/balance", getBalance);

export default router;
