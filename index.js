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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend is reachable" });
});

app.use("/", callRouter);
app.use("/", smsRouter);
app.use("/", bulkSmsRouter);
app.use("/user", Userrouter);
app.use("/contact", contactRouter);
app.use("/report", communityReportRouter);

/*======================================PayHere Routes=========================================*/
// import payHereRouter from "./Routers/PayHereRouter.js";
// app.use("/", payHereRouter);

/*======================================Stripe Routes=========================================*/
import stripeRouter from "./Routers/stripeRouter.js";
app.use("/payment", stripeRouter);

/* ===================== WEBHOOKS ===================== */
import { handleStripeWebhook } from "./Controller/StripeWebHookHandler.js";
if (process.env.NODE_ENV === "development") {
  app.post("/webhook/stripe", express.json(), handleStripeWebhook);
} else {
  app.post("/webhook/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);
}

/* ===================== START SERVER ===================== */
app.listen(5000, async () => {
  console.log("🚀 Server running at http://localhost:5000");

  // Optional: balance check (safe, read-only)
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
