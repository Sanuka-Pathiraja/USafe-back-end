import AppDataSource from "../config/data-source.js";
import { supabase } from "../config/supabase.js";

/**
 * Comprehensive health check for production monitoring
 * Returns service status, dependencies, and version info
 */
export async function getHealthStatus(req, res) {
  const startTime = Date.now();
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.API_VERSION || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    services: {},
    features: {},
  };

  // Database health
  try {
    await AppDataSource.query("SELECT 1");
    health.services.database = {
      status: "connected",
      type: "postgresql",
    };
  } catch (error) {
    health.status = "degraded";
    health.services.database = {
      status: "disconnected",
      error: error.message,
    };
  }

  // Supabase health
  try {
    const { data, error } = await supabase.from("users").select("id").limit(1);
    health.services.supabase = {
      status: error ? "error" : "connected",
      error: error?.message || null,
    };
  } catch (error) {
    health.services.supabase = {
      status: "error",
      error: error.message,
    };
  }

  // SMS service check
  health.services.sms = {
    status: process.env.QUICKSEND_EMAIL && process.env.QUICKSEND_API_KEY ? "configured" : "not_configured",
    provider: "QuickSend",
  };

  // Call service check
  health.services.calls = {
    status: process.env.VONAGE_APPLICATION_ID && process.env.VONAGE_PRIVATE_KEY ? "configured" : "not_configured",
    provider: "Vonage",
  };

  // Payment service check
  health.services.payment = {
    status: process.env.STRIPE_SECRET_KEY ? "configured" : "not_configured",
    provider: "Stripe",
  };

  // Python safety scorer check
  health.services.safety_scorer = {
    status: "available",
    engine: "python",
  };

  // Feature flags
  health.features = {
    calls: process.env.DISABLE_CALLS !== "true",
    sms: process.env.DISABLE_SMS !== "true",
    bulkSms: process.env.DISABLE_BULK_SMS !== "true",
    guardian: true,
    safetyScore: true,
    communityReports: true,
    payments: true,
  };

  // Response time
  health.responseTime = `${Date.now() - startTime}ms`;

  const statusCode = health.status === "healthy" ? 200 : 503;
  return res.status(statusCode).json(health);
}

/**
 * Simple liveness probe for K8s/Docker
 */
export function getLiveness(req, res) {
  return res.status(200).json({ alive: true });
}

/**
 * Readiness probe - checks if app can serve traffic
 */
export async function getReadiness(req, res) {
  try {
    // Check DB connection
    await AppDataSource.query("SELECT 1");
    return res.status(200).json({ ready: true });
  } catch (error) {
    return res.status(503).json({ ready: false, error: error.message });
  }
}
