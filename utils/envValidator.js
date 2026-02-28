/**
 * Environment variable validation for production readiness
 */

const REQUIRED_VARS = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASS",
  "DB_NAME",
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "JWT_SECRET",
];

const OPTIONAL_VARS = {
  QUICKSEND_EMAIL: "SMS alerts will be disabled",
  QUICKSEND_API_KEY: "SMS alerts will be disabled",
  VONAGE_APPLICATION_ID: "Voice calls will be disabled",
  VONAGE_PRIVATE_KEY: "Voice calls will be disabled",
  STRIPE_SECRET_KEY: "Payment features will be disabled",
  GOOGLE_CLIENT_ID: "Google OAuth will be disabled",
  PYTHON_EXECUTABLE: "Defaults to 'python'",
};

export function validateEnvironment() {
  const issues = [];
  const warnings = [];

  // Check required variables
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      issues.push(`❌ Missing required environment variable: ${varName}`);
    }
  }

  // Check optional variables and warn
  for (const [varName, impact] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[varName]) {
      warnings.push(`⚠️  ${varName} not set - ${impact}`);
    }
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push("⚠️  JWT_SECRET should be at least 32 characters for production");
  }

  // Validate NODE_ENV
  if (!process.env.NODE_ENV) {
    warnings.push("⚠️  NODE_ENV not set, defaulting to development mode");
  }

  // Validate database port
  const dbPort = Number(process.env.DB_PORT);
  if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) {
    issues.push("❌ DB_PORT must be a valid port number (1-65535)");
  }

  return { issues, warnings };
}

export function printEnvironmentStatus() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 ENVIRONMENT VALIDATION");
  console.log("=".repeat(60));

  const { issues, warnings } = validateEnvironment();

  if (issues.length === 0) {
    console.log("✅ All required environment variables are set\n");
  } else {
    console.log("❌ CRITICAL ISSUES FOUND:\n");
    issues.forEach((issue) => console.log(`   ${issue}`));
    console.log("");
    return false;
  }

  if (warnings.length > 0) {
    console.log("⚠️  WARNINGS:\n");
    warnings.forEach((warning) => console.log(`   ${warning}`));
    console.log("");
  }

  // Print configuration summary
  console.log("📋 CONFIGURATION SUMMARY:");
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Port: ${process.env.PORT || 5000}`);
  console.log(`   Database: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  console.log(`   SMS Provider: ${process.env.QUICKSEND_API_KEY ? "✅ QuickSend" : "❌ Disabled"}`);
  console.log(`   Voice Calls: ${process.env.VONAGE_APPLICATION_ID ? "✅ Vonage" : "❌ Disabled"}`);
  console.log(`   Payments: ${process.env.STRIPE_SECRET_KEY ? "✅ Stripe" : "❌ Disabled"}`);
  console.log(`   Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? "✅ Enabled" : "❌ Disabled"}`);
  console.log("=".repeat(60) + "\n");

  return true;
}
