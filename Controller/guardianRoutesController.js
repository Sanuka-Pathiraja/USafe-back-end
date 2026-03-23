import AppDataSource from "../config/data-source.js";

const DEFAULT_GUARDIAN_ROUTES_TABLE = "guardian_routes_app";

function resolveSafeTableName(value, fallback) {
  const candidate = String(value || "").trim();
  if (/^[a-z_][a-z0-9_]*$/i.test(candidate)) {
    return candidate;
  }
  return fallback;
}

const GUARDIAN_ROUTES_TABLE = resolveSafeTableName(
  process.env.GUARDIAN_ROUTES_TABLE,
  DEFAULT_GUARDIAN_ROUTES_TABLE
);
const MAX_ROUTE_NAME_LENGTH = 120;
const MAX_CHECKPOINTS = 100;
const MAX_CHECKPOINT_NAME_LENGTH = 120;

function validateCheckpoints(checkpoints) {
  if (!Array.isArray(checkpoints) || checkpoints.length === 0 || checkpoints.length > MAX_CHECKPOINTS) {
    return false;
  }

  return checkpoints.every((checkpoint) => {
    if (checkpoint === null || typeof checkpoint !== "object") {
      return false;
    }

    const checkpointName =
      typeof checkpoint.name === "string" ? checkpoint.name.trim() : "";
    const hasName =
      checkpointName.length > 0 && checkpointName.length <= MAX_CHECKPOINT_NAME_LENGTH;
    const lat = Number(checkpoint.lat);
    const lng = Number(checkpoint.lng);
    const hasLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const hasLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;

    return hasName && hasLat && hasLng;
  });
}

export async function createGuardianRoute(req, res) {
  try {
    const requestId = req.requestId || "n/a";
    console.log("📝 Route save request:", {
      requestId,
      userId: req.user?.id,
      name: req.body.name,
      checkpoints: req.body.checkpoints?.length,
    });

    const { name, route_name, checkpoints, is_active } = req.body;
    const routeName = (name || route_name || "").trim();
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (
      !routeName ||
      routeName.length > MAX_ROUTE_NAME_LENGTH ||
      !validateCheckpoints(checkpoints)
    ) {
      console.log("❌ Validation failed:", {
        requestId,
        name: routeName,
        checkpointsLength: checkpoints?.length,
      });
      return res.status(400).json({
        error:
          "Route name and checkpoints are required. Each checkpoint must include name, lat, and lng.",
      });
    }

    console.log(`[${requestId}] 💾 Attempting to insert route into ${GUARDIAN_ROUTES_TABLE}...`);
    const query = `
      INSERT INTO ${GUARDIAN_ROUTES_TABLE} (user_id, route_name, checkpoints, is_active)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING id, user_id, route_name, checkpoints, is_active, created_at, updated_at
    `;
    const params = [userId, routeName, JSON.stringify(checkpoints), is_active ?? true];
    const result = await AppDataSource.query(query, params);
    const createdRoute = result?.[0];

    if (!createdRoute) {
      return res.status(500).json({ error: "Failed to persist guardian route" });
    }

    console.log(`[${requestId}] ✅ Route saved: "${routeName}" with ${checkpoints.length} checkpoints`);
    return res.status(201).json({ success: true, route: createdRoute });
  } catch (err) {
    console.error("❌ Unexpected error in createGuardianRoute:", {
      requestId: req.requestId || "n/a",
      error: err.message,
    });
    return res.status(500).json({ error: err.message, requestId: req.requestId || null });
  }
}

export async function listGuardianRoutes(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const query = `
      SELECT id, user_id, route_name, checkpoints, is_active, created_at, updated_at
      FROM ${GUARDIAN_ROUTES_TABLE}
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const data = await AppDataSource.query(query, [userId]);

    return res.status(200).json({ success: true, routes: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
