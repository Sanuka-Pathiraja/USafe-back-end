import dotenv from "dotenv";
dotenv.config();

// ✅ Toggle (true = OFF, false = ON)
const DISABLE_COMMUNICATIONS = process.env.DISABLE_COMMUNICATIONS === "true";

// Enhanced debug logging
console.log("📋 Environment Variables Check:");
console.log("DISABLE_COMMUNICATIONS:", DISABLE_COMMUNICATIONS);
console.log("VONAGE_PRIVATE_KEY:", process.env.VONAGE_PRIVATE_KEY);
console.log("VONAGE_APPLICATION_ID:", process.env.VONAGE_APPLICATION_ID);
console.log("VONAGE_FROM_NUMBER:", process.env.VONAGE_FROM_NUMBER);
console.log("QUICKSEND_EMAIL:", process.env.QUICKSEND_EMAIL);
console.log(
  "QUICKSEND_API_KEY:",
  process.env.QUICKSEND_API_KEY ? "✅ Loaded" : "❌ Missing"
);
console.log("---");

import express from "express";
import AppDataSource from "./config/data-source.js";
import makeOutboundCall from "./CallFeat/voiceService.js";
import {
  sendSingleSMS,
  sendBulkSameSMS,
  checkBalance,
} from "./CallFeat/quicksend.js";

const app = express();
app.use(express.json());

/* ===================== CALL ENDPOINT ===================== */
app.post("/call", async (req, res) => {
  if (DISABLE_COMMUNICATIONS) {
    return res.status(503).json({
      message: "Call feature is temporarily disabled (DISABLE_COMMUNICATIONS=true)",
    });
  }

  try {
    console.log("📞 Initiating call...");
    const response = await makeOutboundCall();
    console.log("✅ Call successful:", response);
    res.status(200).json({
      message: "Call initiated successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ Call failed:", error.message);
    console.error("Full error:", error);
    res.status(500).json({
      message: "Failed to make call",
      error: error.message,
    });
  }
});

/* ===================== SMS ENDPOINT ===================== */
app.post("/sms", async (req, res) => {
  if (DISABLE_COMMUNICATIONS) {
    return res.status(503).json({
      message: "SMS feature is temporarily disabled (DISABLE_COMMUNICATIONS=true)",
    });
  }

  try {
    const { to, msg, senderID } = req.body;
    console.log("📱 Sending SMS...");
    const response = await sendSingleSMS(to, msg, senderID);
    res.status(200).json({
      message: "SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ SMS failed:", error.message);
    res.status(500).json({
      message: "Failed to send SMS",
      error: error.message,
    });
  }
});

/* ===================== BALANCE ENDPOINT ===================== */
app.get("/balance", async (req, res) => {
  try {
    const balance = await checkBalance();
    res.status(200).json({
      message: "Balance retrieved",
      data: balance,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to check balance",
      error: error.message,
    });
  }
});

/* ===================== START SERVER ===================== */
app.listen(5000, async () => {
  console.log("🚀 Server running at http://localhost:5000");
  console.log("\n" + "=".repeat(50));
  console.log("🔥 AUTO-STARTING SERVICES ON STARTUP");
  console.log("Communications disabled:", DISABLE_COMMUNICATIONS);
  console.log("=".repeat(50) + "\n");

  // 1️⃣ Check QuickSend Balance (safe)
  console.log("💰 Checking QuickSend Balance...");
  try {
    await checkBalance();
  } catch (error) {
    console.error("❌ Balance check failed:", error.message);
  }

  // 2️⃣ Connect DB (Supabase)
  AppDataSource.initialize()
    .then(() => {
      console.log("✅ Data Source has been initialized! Connected to Supabase.");
    })
    .catch((err) => {
      console.error("❌ Error during Data Source initialization:", err);
    });

  // 🚫 If disabled, stop here (no SMS/call auto-run)
  if (DISABLE_COMMUNICATIONS) {
    console.log("🛑 Startup SMS/Call skipped (DISABLE_COMMUNICATIONS=true)");
    console.log("\n" + "=".repeat(50));
    console.log("✅ Startup completed (DB mode only)");
    console.log("=".repeat(50) + "\n");
    return;
  }

  // 3️⃣ Send SMS on startup (ONLY if enabled)
  console.log("\n📱 Auto-sending SMS on startup...");
  try {
    const smsResponse = await sendSingleSMS(
      "0769653219",
      "Hello! This is an automated test message from SafeZone.",
      "QKSendDemo"
    );
    console.log("✅ Startup SMS successful:", smsResponse);
  } catch (error) {
    console.error("❌ Startup SMS failed:", error.message);
  }

  // 4️⃣ Make Voice Call on startup (ONLY if enabled)
  console.log("\n📞 Auto-initiating call on startup...");
  try {
    const callResponse = await makeOutboundCall();
    console.log("✅ Startup call successful:", callResponse);
  } catch (error) {
    console.error("❌ Startup call failed:", error.message);
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ All startup services completed!");
  console.log("=".repeat(50) + "\n");
});
