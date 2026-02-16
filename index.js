// index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import AppDataSource from "./config/data-source.js";
import { checkBalance } from "./CallFeat/quicksend.js";

import callRouter from "./Routers/CallRouter.js";
import smsRouter from "./Routers/SmsRouter.js";
import bulkSmsRouter from "./Routers/BulkSmsRouter.js";
import Userrouter from "./Routers/UserRouter.js";
import contactRouter from "./Routers/ContactRouter.js";
import communityReportRouter from "./Routers/CommunityReportRouter.js";
import emergencyRouter from "./Routers/EmergencyRouter.js";

/*======================================Stripe Routes=========================================*/
import stripeRouter from "./Routers/stripeRouter.js";

/* ===================== FEATURE TOGGLES ===================== */
const DISABLE_CALLS = process.env.DISABLE_CALLS === "true";
const DISABLE_SMS = process.env.DISABLE_SMS === "true";
const DISABLE_BULK_SMS = process.env.DISABLE_BULK_SMS === "true";

/* ===================== DEBUG ===================== */
console.log("📋 Feature Flags:");
console.log("DISABLE_CALLS:", DISABLE_CALLS);
console.log("DISABLE_SMS:", DISABLE_SMS);
console.log("DISABLE_BULK_SMS:", DISABLE_BULK_SMS);
console.log("---");

/* ===================== APP ===================== */
const app = express();

// ✅ CORS + JSON for normal API routes (Vonage webhook expects JSON too)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend is reachable" });
});

/* ===================== ROUTES ===================== */
app.use("/", callRouter);
app.use("/", smsRouter);
app.use("/", bulkSmsRouter);

app.use("/user", Userrouter);
app.use("/contact", contactRouter);
app.use("/report", communityReportRouter);

app.use("/", emergencyRouter); // ✅ adds /emergency/* and /webhooks/voice-event

app.use("/payment", stripeRouter);

/* ===================== STRIPE WEBHOOK ===================== */
/**
 * IMPORTANT:
 * Stripe webhook needs raw body in production, but that conflicts with express.json().
 * Best practice: mount webhook BEFORE express.json(), but you already have it working.
 * Keep as-is, just ensure this exact path is excluded from any JSON parsing changes.
 */
import { handleStripeWebhook } from "./Controller/StripeWebHookHandler.js";

if (process.env.NODE_ENV === "development") {
  // dev: JSON is okay
  app.post("/webhook/stripe", express.json(), handleStripeWebhook);
} else {
  // prod: raw required for signature verification
  app.post("/webhook/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);
}

/* ===================== START SERVER ===================== */
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);

  // Optional: QuickSend balance check (safe, read-only)
  try {
    await checkBalance();
  } catch (error) {
    console.error("❌ Balance check failed:", error.message);
  }

  // DB init
  try {
    await AppDataSource.initialize();
    console.log("✅ Data Source initialized! Connected to Supabase.");
  } catch (err) {
    console.error("❌ Error during Data Source initialization:", err);
  }
});
