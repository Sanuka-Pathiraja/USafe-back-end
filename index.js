import dotenv from "dotenv";
dotenv.config(); // Explicitly load .env

// Debug: Check if env vars are loaded (remove after testing)
console.log("VONAGE_PRIVATE_KEY loaded:", process.env.VONAGE_PRIVATE_KEY);
console.log("VONAGE_APPLICATION_ID loaded:", process.env.VONAGE_APPLICATION_ID);

import express from "express";
import AppDataSource from "./config/data-source.js";
import makeOutboundCall from "./CallFeat/voiceService.js";

const app = express();
app.use(express.json());

// DB Initialization
AppDataSource.initialize()
  .then(() => console.log("📌 PostgreSQL + TypeORM Connected Successfully!"))
  .catch((err) => console.error("❌ DB Connection Error: ", err));

app.get("/", (req, res) => {
  res.send("SafeZone Main App Running");
});

app.post("/call", async (req, res) => {
  try {
    const response = await makeOutboundCall();
    res.status(200).json({
      message: "Call initiated successfully",
      data: response,
    });
  } catch (error) {
    console.error("Call error:", error.message); // Log for debugging
    res.status(500).json({
      message: "Failed to make call",
      error: error.message,
    });
  }
});

app.listen(5000, () => {
  console.log("🚀 Server running at http://localhost:5000");
});
