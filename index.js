import dotenv from "dotenv";
dotenv.config();

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

console.log("📋 Environment Variables Check:");
console.log("VONAGE_APPLICATION_ID:", process.env.VONAGE_APPLICATION_ID);
console.log("VONAGE_FROM_NUMBER:", process.env.VONAGE_FROM_NUMBER);
console.log("QUICKSEND_EMAIL:", process.env.QUICKSEND_EMAIL);
console.log(
  "QUICKSEND_API_KEY:",
  process.env.QUICKSEND_API_KEY ? "✅ Loaded" : "❌ Missing"
);
console.log("---");

/* ===================== IMPORTS ===================== */
import express from "express";
import AppDataSource from "./config/data-source.js";
import makeOutboundCall from "./CallFeat/voiceService.js";
import {
  sendSingleSMS,
  sendBulkSameSMS,
  checkBalance,
} from "./CallFeat/quicksend.js";

/* ===================== APP ===================== */
const app = express();
app.use(express.json());

/* ===================== CALL ENDPOINT ===================== */
app.post("/call", async (req, res) => {
  if (DISABLE_CALLS) {
    return res.status(503).json({
      message: "Call feature is disabled (DISABLE_CALLS=true)",
    });
  }

  try {
    console.log("📞 Initiating call...");
    const response = await makeOutboundCall();
    res.status(200).json({
      message: "Call initiated successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ Call failed:", error.message);
    res.status(500).json({
      message: "Failed to make call",
      error: error.message,
    });
  }
});

/* ===================== SMS ENDPOINT ===================== */
app.post("/sms", async (req, res) => {
  if (DISABLE_SMS) {
    return res.status(503).json({
      message: "SMS feature is disabled (DISABLE_SMS=true)",
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

/* ===================== BULK SMS ENDPOINT ===================== */
app.post("/bulk-sms", async (req, res) => {
  if (DISABLE_BULK_SMS) {
    return res.status(503).json({
      message: "Bulk SMS feature is disabled (DISABLE_BULK_SMS=true)",
    });
  }

  try {
    const { to, msg, senderID } = req.body;
    console.log("📱 Sending Bulk SMS...");
    const response = await sendBulkSameSMS(to, msg, senderID);
    res.status(200).json({
      message: "Bulk SMS sent successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ Bulk SMS failed:", error.message);
    res.status(500).json({
      message: "Failed to send Bulk SMS",
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
  console.log("🔥 STARTUP MODE");
  console.log("Calls disabled:", DISABLE_CALLS);
  console.log("SMS disabled:", DISABLE_SMS);
  console.log("Bulk SMS disabled:", DISABLE_BULK_SMS);
  console.log("=".repeat(50) + "\n");

  /* ===================== BALANCE CHECK ===================== */
  try {
    await checkBalance();
  } catch (error) {
    console.error("❌ Balance check failed:", error.message);
  }

  /* ===================== DB INIT ===================== */
  try {
    await AppDataSource.initialize();
    console.log("✅ Data Source initialized! Connected to Supabase.");
  } catch (err) {
    console.error("❌ Error during Data Source initialization:", err);
  }

  /* ===================== OPTIONAL STARTUP ACTIONS ===================== */

  if (!DISABLE_SMS) {
    console.log("\n📱 Auto-sending SMS on startup...");
    try {
      await sendSingleSMS(
        "0769653219",
        "Hello! This is an automated test message from SafeZone.",
        "QKSendDemo"
      );
      console.log("✅ Startup SMS successful");
    } catch (error) {
      console.error("❌ Startup SMS failed:", error.message);
    }
  }

  if (!DISABLE_CALLS) {
    console.log("\n📞 Auto-initiating call on startup...");
    try {
      await makeOutboundCall();
      console.log("✅ Startup call successful");
    } catch (error) {
      console.error("❌ Startup call failed:", error.message);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Startup completed");
  console.log("=".repeat(50) + "\n");
});
