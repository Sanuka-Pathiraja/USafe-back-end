import { Router } from "express";
import { sendBulkSms } from "../Controller/BulkSmsController.js";

const router = Router();

router.post("/bulk-sms", sendBulkSms);

export default router;
