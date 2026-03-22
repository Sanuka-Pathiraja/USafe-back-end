import fs from "fs";
import path from "path";

const requiredEnv = [
  "JWT_SECRET",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASS",
  "DB_NAME",
];

const recommendedEnv = [
  "TRIP_EXPIRY_SWEEP_MS",
  "SAFETY_SCORE_TIMEOUT_MS",
  "GUARDIAN_CHECKPOINT_RADIUS_METERS",
  "QUICKSEND_EMAIL",
  "QUICKSEND_API_KEY",
  "SOS_SENDER_ID",
];

function print(title, items, marker) {
  if (items.length === 0) return;
  console.log(`\n${title}`);
  for (const item of items) {
    console.log(`${marker} ${item}`);
  }
}

function isPortValid(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function run() {
  const errors = [];
  const warnings = [];

  for (const key of requiredEnv) {
    if (!process.env[key]) {
      errors.push(`Missing required env: ${key}`);
    }
  }

  for (const key of recommendedEnv) {
    if (!process.env[key]) {
      warnings.push(`Missing recommended env: ${key}`);
    }
  }

  if (process.env.DB_PORT && !isPortValid(process.env.DB_PORT)) {
    errors.push("DB_PORT must be a valid integer between 1 and 65535");
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push("JWT_SECRET should be at least 32 characters for production");
  }

  const scorerPath = path.resolve(process.cwd(), "safety_score.py");
  if (!fs.existsSync(scorerPath)) {
    errors.push("Missing safety_score.py at repository root");
  }

  const inProduction = process.env.NODE_ENV === "production";
  if (inProduction && (!process.env.QUICKSEND_EMAIL || !process.env.QUICKSEND_API_KEY)) {
    warnings.push("SMS provider credentials are missing; emergency SMS will fail in production");
  }

  print("Errors", errors, "[ERROR]");
  print("Warnings", warnings, "[WARN ]");

  if (errors.length > 0) {
    console.log("\nSafePath preflight failed.");
    process.exit(1);
  }

  console.log("\nSafePath preflight passed.");
}

run();
