import AppDataSource from "../config/data-source.js";
import { sendSingleSMS } from "../CallFeat/quicksend.js";
import { notifyUser } from "../utils/wsHub.js";

const GUARDIAN_ROUTES_TABLE = process.env.GUARDIAN_ROUTES_TABLE || "guardian_routes_app";
const GUARDIAN_PROGRESS_TABLE =
  process.env.GUARDIAN_ROUTE_PROGRESS_TABLE || "guardian_route_progress";
const DEFAULT_RADIUS_METERS = Number(process.env.GUARDIAN_CHECKPOINT_RADIUS_METERS || 50);

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const radius = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

function normalizePhone(phone) {
  if (typeof phone !== "string") {
    return "";
  }
  return phone.trim();
}

function isSmsConfigured() {
  return Boolean(process.env.QUICKSEND_EMAIL && process.env.QUICKSEND_API_KEY);
}

async function resolveParentPhone(userId, providedPhone) {
  const normalized = normalizePhone(providedPhone || "");
  if (normalized) {
    return normalized;
  }

  if (!userId) {
    return "";
  }

  const users = await AppDataSource.query(
    `SELECT phone FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  return normalizePhone(users?.[0]?.phone || "");
}

async function isRouteCompleted(userId, routeId, totalCheckpoints) {
  const progressRows = await AppDataSource.query(
    `SELECT COUNT(DISTINCT checkpoint_index) AS count
     FROM ${GUARDIAN_PROGRESS_TABLE}
     WHERE user_id = $1 AND route_id = $2 AND checkpoint_index >= 0`,
    [userId, routeId]
  );

  const passedCount = Number(progressRows?.[0]?.count || 0);
  return passedCount >= totalCheckpoints;
}

export async function trackGuardianProgress(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const routeId = toNumber(req.body.routeId ?? req.body.route_id);
    const lat = toNumber(req.body.lat);
    const lng = toNumber(req.body.lng);
    const radiusMeters = toNumber(req.body.radiusMeters) ?? DEFAULT_RADIUS_METERS;

    if (!routeId) {
      return res.status(400).json({ error: "routeId is required" });
    }

    if (!isValidLatLng(lat, lng)) {
      return res.status(400).json({ error: "Invalid lat/lng" });
    }

    const routes = await AppDataSource.query(
      `SELECT id, user_id, route_name, checkpoints
       FROM ${GUARDIAN_ROUTES_TABLE}
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [routeId, userId]
    );

    const route = routes?.[0];
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }

    const checkpoints = Array.isArray(route.checkpoints) ? route.checkpoints : [];
    if (checkpoints.length === 0) {
      return res.status(400).json({ error: "Route has no checkpoints" });
    }

    const matches = [];
    checkpoints.forEach((checkpoint, index) => {
      const cLat = toNumber(checkpoint?.lat);
      const cLng = toNumber(checkpoint?.lng);
      if (!isValidLatLng(cLat, cLng)) {
        return;
      }

      const distance = haversineMeters(lat, lng, cLat, cLng);
      if (distance <= radiusMeters) {
        matches.push({
          index,
          name: checkpoint?.name || `Checkpoint ${index + 1}`,
          distance: Math.round(distance),
        });
      }
    });

    if (matches.length === 0) {
      return res.status(200).json({
        success: true,
        routeId: route.id,
        routeName: route.route_name,
        matched: 0,
        alertsSent: 0,
      });
    }

    const parentPhone = await resolveParentPhone(userId, req.body.parentPhone);
    if (!parentPhone) {
      return res.status(400).json({ error: "parentPhone is required" });
    }

    if (!isSmsConfigured() && process.env.NODE_ENV === "production") {
      return res.status(503).json({ error: "SMS provider is not configured" });
    }

    const senderID = process.env.SOS_SENDER_ID || "QKSendDemo";
    const alerts = [];

    for (const match of matches) {
      const insertResult = await AppDataSource.query(
        `INSERT INTO ${GUARDIAN_PROGRESS_TABLE}
           (user_id, route_id, checkpoint_index, checkpoint_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, route_id, checkpoint_index) DO NOTHING
         RETURNING id`,
        [userId, route.id, match.index, match.name]
      );

      if (!insertResult?.[0]) {
        continue;
      }

      const message = `SafePath: Child has reached ${match.name}.`;
      if (isSmsConfigured()) {
        await sendSingleSMS(parentPhone, message, senderID);
      } else {
        console.log(`[SIMULATION] To: ${parentPhone} | Msg: ${message}`);
      }

      notifyUser(userId, {
        type: "checkpoint_passed",
        routeId: route.id,
        routeName: route.route_name,
        checkpoint: match.name,
        checkpointIndex: match.index,
        distanceMeters: match.distance,
        timestamp: new Date().toISOString(),
      });

      alerts.push({
        checkpoint: match.name,
        checkpointIndex: match.index,
        distanceMeters: match.distance,
      });
    }

    if (await isRouteCompleted(userId, route.id, checkpoints.length)) {
      const completionInsert = await AppDataSource.query(
        `INSERT INTO ${GUARDIAN_PROGRESS_TABLE}
           (user_id, route_id, checkpoint_index, checkpoint_name)
         VALUES ($1, $2, -1, 'ROUTE_COMPLETE')
         ON CONFLICT (user_id, route_id, checkpoint_index) DO NOTHING
         RETURNING id`,
        [userId, route.id]
      );

      if (completionInsert?.[0]) {
        const completionMessage = `SafePath: Route "${route.route_name}" completed.`;
        if (isSmsConfigured()) {
          await sendSingleSMS(parentPhone, completionMessage, senderID);
        } else {
          console.log(`[SIMULATION] To: ${parentPhone} | Msg: ${completionMessage}`);
        }

        notifyUser(userId, {
          type: "route_completed",
          routeId: route.id,
          routeName: route.route_name,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return res.status(200).json({
      success: true,
      routeId: route.id,
      routeName: route.route_name,
      matched: matches.length,
      alertsSent: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error("❌ trackGuardianProgress error:", error.message);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
