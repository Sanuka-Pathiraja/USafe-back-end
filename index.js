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
import http from "http";

import AppDataSource from "./config/data-source.js";
import { checkBalance } from "./CallFeat/quicksend.js";

import callRouter from "./Routers/CallRouter.js";
import smsRouter from "./Routers/SmsRouter.js";
import bulkSmsRouter from "./Routers/BulkSmsRouter.js";
import Userrouter from "./Routers/UserRouter.js";
import contactRouter from "./Routers/ContactRouter.js";
import communityReportRouter from "./Routers/CommunityReportRouter.js";
import guardianRouter from "./Routers/guardianRouter.js";
import tripRouter from "./Routers/TripRouter.js";
import healthRouter from "./Routers/healthRouter.js";
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
app.use("/trip", tripRouter);
app.use("/api/trip", tripRouter);

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
async function startServer() {
  try {
    await AppDataSource.initialize();
    console.log("✅ Data Source initialized! Connected to database.");
  } catch (err) {
    console.error("❌ Error during Data Source initialization:", err);
    process.exit(1);
  }

  const port = Number(process.env.PORT || 5000);
  initializeWebSocket(server);
  server.listen(port, async () => {
    console.log(`🚀 Server running at http://localhost:${port}`);

    try {
      await checkBalance();
    } catch (error) {
      console.error("❌ Balance check failed:", error.message);
    }
  });
}

startServer();
