import { Router } from "express";
import { sendNotifyBulkSMS } from "../Controller/NotifyLkBulkSmsController.js";

const router = Router();

// Bulk Notify.lk SMS
router.post("/sms/notify/bulk", sendNotifyBulkSMS);

export default router;
