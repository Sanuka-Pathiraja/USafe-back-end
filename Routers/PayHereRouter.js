import express from "express";
import { createPayHerePayment, payHereNotify } from "../controllers/payhere.controller.js";

const router = express.Router();

router.post("/payhere/create", createPayHerePayment);
router.post("/payhere/notify", payHereNotify);

export default router;
