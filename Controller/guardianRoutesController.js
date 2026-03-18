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

function validateCheckpoints(checkpoints) {
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    return false;
  }

  return checkpoints.every((checkpoint) => {
    if (checkpoint === null || typeof checkpoint !== "object") {
      return false;
    }

    const hasName =
      typeof checkpoint.name === "string" && checkpoint.name.trim().length > 0;
    const lat = Number(checkpoint.lat);
    const lng = Number(checkpoint.lng);
    const hasLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const hasLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;

    return hasName && hasLat && hasLng;
  });
}

export async function createGuardianRoute(req, res) {
  try {
    console.log("📝 Route save request:", {
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

    if (!routeName || !validateCheckpoints(checkpoints)) {
      console.log("❌ Validation failed:", {
        name: routeName,
        checkpointsLength: checkpoints?.length,
      });
      return res.status(400).json({
        error:
          "Route name and checkpoints are required. Each checkpoint must include name, lat, and lng.",
      });
    }

    console.log(`💾 Attempting to insert route into ${GUARDIAN_ROUTES_TABLE}...`);
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

    console.log(`✅ Route saved: "${routeName}" with ${checkpoints.length} checkpoints`);
    return res.status(201).json({ success: true, route: createdRoute });
  } catch (err) {
    console.error("❌ Unexpected error in createGuardianRoute:", err);
    return res.status(500).json({ error: err.message });
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
