import dotenv from "dotenv";
dotenv.config();

import { printEnvironmentStatus } from "./utils/envValidator.js";

// Validate environment before starting
if (!printEnvironmentStatus()) {
  console.error("❌ Environment validation failed. Please fix the issues above.");
  // Removed process.exit(1) to prevent server crash
}

import express from "express";
import cors from "cors";
import http from "http";

import AppDataSource from "./config/data-source.js";
import { checkBalance } from "./CallFeat/quicksend.js";
import { checkNotifyBalance } from "./CallFeat/notifylkStatus.js";

import callRouter from "./Routers/CallRouter.js";
import smsRouter from "./Routers/SmsRouter.js";
import bulkSmsRouter from "./Routers/BulkSmsRouter.js";
import Userrouter from "./Routers/UserRouter.js";
import contactRouter from "./Routers/ContactRouter.js";
import communityReportRouter from "./Routers/CommunityReportRouter.js";
import guardianRouter from "./Routers/guardianRouter.js";
import healthRouter from "./Routers/healthRouter.js";

// Newly imported from feat01
import emergencyRouter from "./Routers/EmergencyRouter.js";
import notifyLkSmsRouter from "./Routers/NofityLkSmsRouter.js";
import notifyLkBulkSmsRouter from "./Routers/NotifyLkBulkSmsRouter.js";
import emergencyProcessRouter from "./Routers/EmergencyProcessRouter.js";
import safetyScoreRouter from "./Routers/SafetyScoreRouter.js";

import { standardLimiter, generousLimiter } from "./middleware/rateLimiter.js";
import { initializeWebSocket } from "./utils/wsHub.js";

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
const server = http.createServer(app);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  const baseJson = res.json.bind(res);
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return baseJson(body);
  };
  next();
});

// Apply rate limiting based on environment
if (process.env.NODE_ENV === "production") {
  app.use("/api", standardLimiter);
  app.use("/health", generousLimiter);
}

app.use("/", healthRouter);
app.use("/", callRouter);
app.use("/", smsRouter);
app.use("/", bulkSmsRouter);
app.use("/user", Userrouter);
app.use("/contact", contactRouter);
app.use("/report", communityReportRouter);
app.use("/api/guardian", guardianRouter);

// Use new feat01 routes
app.use("/", emergencyRouter);
app.use("/", notifyLkSmsRouter);
app.use("/", notifyLkBulkSmsRouter);
app.use("/", emergencyProcessRouter);
app.use("/", safetyScoreRouter);

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
async function startServer() {
  try {
    await AppDataSource.initialize();
    console.log("✅ Data Source initialized! Connected to database.");
  } catch (err) {
    console.error("❌ Error during Data Source initialization:", err);
    // Removed process.exit(1) to prevent server crash
  }

  const port = Number(process.env.PORT || 5000);
  initializeWebSocket(server);
  server.listen(port, async () => {
    console.log(`🚀 Server running at http://localhost:${port}`);

    try {
      await checkBalance();
    } catch (error) {
      console.error("❌ Twilio/Vonage Balance check failed:", error.message);
    }

    try {
      const status = await checkNotifyBalance();
      console.log("✅ Notify.lk Status:", status.active ? "Active" : "Inactive");
      console.log("✅ Notify.lk Balance:", status.acc_balance);
    } catch (error) {
      console.error("❌ Notify.lk balance check failed:", error.message);
    }
  });
}

startServer();
