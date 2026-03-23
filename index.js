import dotenv from "dotenv";
dotenv.config();

import { printEnvironmentStatus } from "./utils/envValidator.js";

// Validate environment before starting
if (!printEnvironmentStatus()) {
  console.error("❌ Environment validation failed. Please fix the issues above.");
  process.exit(1);
}

import express from "express";
import cors from "cors";
import authMiddleware from "./middleware/authMiddleware.js";

import AppDataSource from "./config/data-source.js";
import { checkNotifyBalance } from "./CallFeat/notifylkStatus.js";
import { checkBalance } from "./CallFeat/quicksend.js";

import callRouter from "./Routers/CallRouter.js";
import smsRouter from "./Routers/SmsRouter.js";
import bulkSmsRouter from "./Routers/BulkSmsRouter.js";
import notifyLkBulkSmsRouter from "./Routers/NotifyLkBulkSmsRouter.js";
import Userrouter from "./Routers/UserRouter.js";
import contactRouter from "./Routers/ContactRouter.js";
import communityReportRouter from "./Routers/CommunityReportRouter.js";
import emergencyRouter from "./Routers/EmergencyRouter.js";
import silentCallRouter from "./Routers/SilentCallRouter.js";
import tripRouter from "./Routers/TripRouter.js";
import safeRouteRouter from "./Routers/safeRouteRouter.js";
import notificationRouter from "./Routers/NotificationRouter.js";
import { getLiveSafetyScore } from "./Controller/CommunityReportController.js";
import guardianRouter from "./Routers/guardianRouter.js";
import { standardLimiter, generousLimiter, requestTimeout } from "./middleware/rateLimiter.js";
import * as TripController from "./Controller/TripController.js";

const bootstrapTripTimers = TripController.bootstrapTripTimers || (async () => {});
const shutdownTripSchedulers = TripController.shutdownTripSchedulers || (() => {});
const startTripExpirySweep = TripController.startTripExpirySweep || (() => {});

// Legacy unused emergency notify scenario (kept commented intentionally)
// import notifyLkEmergencyRouter from "./Routers/NofityLkSmsRouter.js";

/*======================================Stripe Routes=========================================*/
import stripeRouter from "./Routers/stripeRouter.js";

/* ===================== FEATURE TOGGLES ===================== */
const DISABLE_CALLS = process.env.DISABLE_CALLS === "true";
const DISABLE_SMS = process.env.DISABLE_SMS === "true";
const DISABLE_BULK_SMS = process.env.DISABLE_BULK_SMS === "true";

/* ===================== DEBUG ===================== */
console.log("Feature Flags:");
console.log("DISABLE_CALLS:", DISABLE_CALLS);
console.log("DISABLE_SMS:", DISABLE_SMS);
console.log("DISABLE_BULK_SMS:", DISABLE_BULK_SMS);
console.log("---");

/* ===================== APP ===================== */
const app = express();

// Guardian branch hardening middleware, added without changing feat01 route behavior.
if (process.env.NODE_ENV === "production") {
  app.use(requestTimeout);
  app.use("/api", standardLimiter);
  app.use("/health", generousLimiter);
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use((req, res, next) => {
  const baseJson = res.json.bind(res);
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return baseJson(body);
  };
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend is reachable" });
});

/* ===================== ROUTES ===================== */
app.use("/", callRouter);
app.use("/", smsRouter);
app.use("/", bulkSmsRouter);
app.use("/", notifyLkBulkSmsRouter);

app.use("/user", Userrouter);
app.use("/contact", contactRouter);
app.use("/report", communityReportRouter);
app.use("/api/trip", tripRouter);
if (process.env.NODE_ENV === "production") {
  app.use("/trip", standardLimiter, tripRouter);
} else {
  app.use("/trip", tripRouter);
}
app.use("/api/guardian", guardianRouter);
app.use("/", safeRouteRouter);
app.use("/", notificationRouter);

// Compatibility alias for clients that call /safety-score directly.
app.post("/safety-score", authMiddleware, getLiveSafetyScore);
app.get("/safety-score", authMiddleware, getLiveSafetyScore);

app.use("/", emergencyRouter);
app.use("/", silentCallRouter);
// app.use("/", notifyLkEmergencyRouter); // Legacy unused emergency scenario

app.use("/payment", stripeRouter);

/* ===================== STRIPE WEBHOOK ===================== */
import { handleStripeWebhook } from "./Controller/StripeWebHookHandler.js";
if (process.env.NODE_ENV === "development") {
  app.post("/webhook/stripe", express.json(), handleStripeWebhook);
} else {
  app.post("/webhook/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);
}

function registerGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`[SHUTDOWN] Received ${signal}, closing server resources...`);
    shutdownTripSchedulers();

    try {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
        console.log("[SHUTDOWN] Data source closed");
      }
    } catch (dbError) {
      console.error("[SHUTDOWN] Data source close error:", dbError);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

registerGracefulShutdown();

/* ===================== START SERVER ===================== */
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);

  try {
    const status = await checkNotifyBalance();
    console.log("Notify.lk Status:", status.active ? "Active" : "Inactive");
    console.log("Notify.lk Balance:", status.acc_balance);
  } catch (error) {
    console.error("Notify.lk balance check failed:", error.message);
  }

  try {
    await AppDataSource.initialize();
    console.log("Data Source initialized! Connected to Supabase.");
    await bootstrapTripTimers();
    startTripExpirySweep();
  } catch (err) {
    console.error("Error during Data Source initialization:", err);
  }

  try {
    await checkBalance();
  } catch (error) {
    console.error("Balance check failed:", error.message);
  }
});
