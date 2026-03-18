import crypto from "crypto";
import AppDataSource from "../config/data-source.js";
import { sendSms } from "../services/SmsService.js";
import { TRIP_SESSION_STATUS } from "../Model/TripSession.js";
import { buildPublicTrackingPayload, isValidTrackingId } from "../utils/tracking.js";

// In-process timer registry for auto-SOS. Move to a persistent queue for multi-instance deployments.
const tripTimeouts = new Map();
let tripExpirySweepHandle = null;

const RAW_TRIP_EXPIRY_SWEEP_MS = Number(process.env.TRIP_EXPIRY_SWEEP_MS || 15000);
const TRIP_EXPIRY_SWEEP_MS = Number.isFinite(RAW_TRIP_EXPIRY_SWEEP_MS)
  ? Math.min(Math.max(RAW_TRIP_EXPIRY_SWEEP_MS, 5000), 60000)
  : 15000;

const MAX_TRIP_NAME_LENGTH = 120;
const MAX_TRIP_CONTACTS = 20;
const MAX_TRIP_DURATION_MINUTES = 24 * 60;

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseCoordinate(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function parseContactIds(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return [...new Set(raw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
}

function resolveTripId(req) {
  return String(req.params?.tripId || req.body?.tripId || "").trim();
}

function resolveTrackingId(req) {
  return String(req.params?.trackingId || req.query?.trackingId || "").trim();
}

function sendError(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message });
}

// Disable HTTP caching so contacts always see near-real-time trip state.
function setNoCacheHeaders(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function buildTrackingUrl(trackingId) {
  const baseUrl =
    process.env.TRIP_TRACKING_BASE_URL ||
    process.env.WEB_DASHBOARD_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "https://tracking.usafe.app/trip";

  return `${String(baseUrl).replace(/\/+$/, "")}/${encodeURIComponent(trackingId)}`;
}

async function generateUniqueTrackingId(tripRepo) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = crypto.randomBytes(6).toString("base64url");
    const exists = await tripRepo.exist({ where: { trackingId: candidate } });
    if (!exists) return candidate;
  }

  throw new Error("Unable to generate unique tracking ID");
}

async function sendSmsToContactsWithTrackingUrl({ contacts, tripName, durationMinutes, trackingUrl }) {
  const body = `USafe alert: Trip '${tripName}' has started. ETA ${durationMinutes} mins. Live tracking: ${trackingUrl}`;

  const results = await Promise.allSettled(
    contacts.map((contact) =>
      sendSms({
        to: contact.phone,
        body,
      })
    )
  );

  return results.map((result, index) => ({
    contactId: contacts[index].contactId,
    phone: contacts[index].phone,
    ok: result.status === "fulfilled",
    error: result.status === "rejected" ? String(result.reason?.message || result.reason) : null,
  }));
}

async function escalateToEmergencyContacts({ tripId, userId, contactIds }) {
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return { attempted: 0, sent: 0, failed: 0, results: [] };
  }

  const contactRepo = AppDataSource.getRepository("Contact");
  const contacts = await contactRepo.find({
    where: contactIds.map((contactId) => ({
      contactId,
      user: { id: userId },
    })),
    select: {
      contactId: true,
      name: true,
      phone: true,
    },
  });

  const message =
    "USafe SOS: Emergency detected during active trip. Please check immediately.";

  const outcomes = await Promise.allSettled(
    contacts.map((contact) =>
      sendSms({
        to: contact.phone,
        body: message,
      })
    )
  );

  const results = outcomes.map((outcome, index) => ({
    contactId: contacts[index]?.contactId,
    phone: contacts[index]?.phone,
    ok: outcome.status === "fulfilled",
    error: outcome.status === "rejected" ? String(outcome.reason?.message || outcome.reason) : null,
  }));

  const sent = results.filter((item) => item.ok).length;
  const failed = results.length - sent;

  console.log(
    JSON.stringify({
      event: "TRIP_SOS_ESCALATION_DISPATCHED",
      tripId,
      userId,
      attempted: results.length,
      sent,
      failed,
      at: new Date().toISOString(),
    })
  );

  return {
    attempted: results.length,
    sent,
    failed,
    results,
  };
}

function clearTripTimer(tripId) {
  const existing = tripTimeouts.get(tripId);
  if (!existing) return;

  clearTimeout(existing);
  tripTimeouts.delete(tripId);
}

async function claimTripForSosById(tripId) {
  const rows = await AppDataSource.query(
    `
      UPDATE "trip_sessions"
      SET "status" = $1, "updatedAt" = now()
      WHERE "id" = $2 AND "status" = $3
      RETURNING "id", "userId", "contactIds"
    `,
    [TRIP_SESSION_STATUS.SOS, tripId, TRIP_SESSION_STATUS.ACTIVE]
  );

  return rows?.[0] || null;
}

export async function processExpiredTrips() {
  const rows = await AppDataSource.query(
    `
      UPDATE "trip_sessions"
      SET "status" = $1, "updatedAt" = now()
      WHERE "status" = $2 AND "expectedEndTime" <= now()
      RETURNING "id", "userId", "contactIds"
    `,
    [TRIP_SESSION_STATUS.SOS, TRIP_SESSION_STATUS.ACTIVE]
  );

  for (const row of rows) {
    await escalateToEmergencyContacts({
      tripId: row.id,
      userId: row.userId,
      contactIds: row.contactIds || [],
    });
    clearTripTimer(row.id);
  }

  return rows.length;
}

function scheduleAutoSos(tripSession) {
  clearTripTimer(tripSession.id);

  const msUntilExpiry = Math.max(0, new Date(tripSession.expectedEndTime).getTime() - Date.now());
  const timeoutHandle = setTimeout(async () => {
    try {
      const claimedTrip = await claimTripForSosById(tripSession.id);
      if (!claimedTrip) {
        clearTripTimer(tripSession.id);
        return;
      }

      // Session timed out without safe completion, so escalate automatically.
      await escalateToEmergencyContacts({
        tripId: claimedTrip.id,
        userId: claimedTrip.userId,
        contactIds: claimedTrip.contactIds || [],
      });
      clearTripTimer(claimedTrip.id);
    } catch (error) {
      console.error("AUTO_SOS_TIMER_ERROR", error);
    }
  }, msUntilExpiry);

  tripTimeouts.set(tripSession.id, timeoutHandle);
}

export async function bootstrapTripTimers() {
  const expiredCount = await processExpiredTrips();

  const tripRepo = AppDataSource.getRepository("TripSession");
  const activeTrips = await tripRepo.find({
    where: { status: TRIP_SESSION_STATUS.ACTIVE },
  });

  for (const trip of activeTrips) {
    scheduleAutoSos(trip);
  }

  console.log(`[TRIP] Processed ${expiredCount} expired trips and restored ${activeTrips.length} active trip timers`);
}

export function startTripExpirySweep() {
  if (tripExpirySweepHandle) return;

  tripExpirySweepHandle = setInterval(async () => {
    try {
      const processed = await processExpiredTrips();
      if (processed > 0) {
        console.log(`[TRIP] Expiry sweep escalated ${processed} trips`);
      }
    } catch (error) {
      console.error("TRIP_EXPIRY_SWEEP_ERROR", error);
    }
  }, TRIP_EXPIRY_SWEEP_MS);

  if (typeof tripExpirySweepHandle.unref === "function") {
    tripExpirySweepHandle.unref();
  }
}

async function getOwnedTripOrThrow({ tripId, userId, tripRepo }) {
  const trip = await tripRepo.findOneBy({ id: tripId, userId });
  if (!trip) {
    const error = new Error("Trip session not found");
    error.statusCode = 404;
    throw error;
  }
  return trip;
}

export async function startTrip(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { tripName, durationMinutes, contactIds } = req.body || {};

    const cleanTripName = String(tripName || "").trim();
    const safeDurationMinutes = parsePositiveInt(durationMinutes);
    const safeContactIds = parseContactIds(contactIds);

    if (!cleanTripName) {
      return res.status(400).json({ success: false, message: "tripName is required" });
    }
    if (cleanTripName.length > MAX_TRIP_NAME_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `tripName must be at most ${MAX_TRIP_NAME_LENGTH} characters`,
      });
    }

    if (!safeDurationMinutes) {
      return res.status(400).json({ success: false, message: "durationMinutes must be a positive integer" });
    }
    if (safeDurationMinutes > MAX_TRIP_DURATION_MINUTES) {
      return res.status(400).json({
        success: false,
        message: `durationMinutes must be <= ${MAX_TRIP_DURATION_MINUTES}`,
      });
    }

    if (safeContactIds.length === 0) {
      return res.status(400).json({ success: false, message: "contactIds must contain at least one valid contact ID" });
    }
    if (safeContactIds.length > MAX_TRIP_CONTACTS) {
      return res.status(400).json({
        success: false,
        message: `contactIds must contain at most ${MAX_TRIP_CONTACTS} contacts`,
      });
    }

    const tripRepo = AppDataSource.getRepository("TripSession");
    const contactRepo = AppDataSource.getRepository("Contact");

    // Enforce that only this user's saved contacts can be attached to the trip.
    const contacts = await contactRepo.find({
      where: safeContactIds.map((contactId) => ({ contactId, user: { id: userId } })),
      select: {
        contactId: true,
        phone: true,
      },
    });

    if (contacts.length !== safeContactIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more contactIds are invalid for this user",
      });
    }

    const now = Date.now();
    const expectedEndTime = new Date(now + safeDurationMinutes * 60 * 1000);
    const trackingId = await generateUniqueTrackingId(tripRepo);

    const session = tripRepo.create({
      userId,
      tripName: cleanTripName,
      status: TRIP_SESSION_STATUS.ACTIVE,
      expectedEndTime,
      trackingId,
      lastKnownLat: null,
      lastKnownLng: null,
      contactIds: safeContactIds,
    });

    const savedSession = await tripRepo.save(session);
    const trackingUrl = buildTrackingUrl(savedSession.trackingId);

    const notifications = await sendSmsToContactsWithTrackingUrl({
      contacts,
      tripName: savedSession.tripName,
      durationMinutes: safeDurationMinutes,
      trackingUrl,
    });

    scheduleAutoSos(savedSession);

    return res.status(201).json({
      success: true,
      message: "Trip safety session started",
      data: {
        tripId: savedSession.id,
        tripName: savedSession.tripName,
        status: savedSession.status,
        expectedEndTime: savedSession.expectedEndTime,
        trackingId: savedSession.trackingId,
        trackingUrl,
        notifications,
      },
    });
  } catch (error) {
    console.error("START_TRIP_ERROR", error);
    return res.status(500).json({ success: false, message: "Failed to start trip session" });
  }
}

export async function updateLocation(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const tripId = resolveTripId(req);
    const lat = parseCoordinate(req.body?.lat, -90, 90);
    const lng = parseCoordinate(req.body?.lng, -180, 180);

    if (!tripId) {
      return res.status(400).json({ success: false, message: "tripId is required" });
    }

    if (lat === null || lng === null) {
      return res.status(400).json({ success: false, message: "lat and lng are required and must be valid coordinates" });
    }

    const tripRepo = AppDataSource.getRepository("TripSession");
    // Guard against cross-user access by fetching with both tripId and userId.
    const trip = await getOwnedTripOrThrow({ tripId, userId, tripRepo });

    if (trip.status !== TRIP_SESSION_STATUS.ACTIVE) {
      return res.status(409).json({ success: false, message: "Only ACTIVE trips can receive location updates" });
    }

    trip.lastKnownLat = lat;
    trip.lastKnownLng = lng;
    const updatedTrip = await tripRepo.save(trip);

    return res.status(200).json({
      success: true,
      message: "Location updated",
      data: {
        tripId: updatedTrip.id,
        lastKnownLat: updatedTrip.lastKnownLat,
        lastKnownLng: updatedTrip.lastKnownLng,
        updatedAt: updatedTrip.updatedAt,
      },
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    console.error("UPDATE_TRIP_LOCATION_ERROR", error);
    return res.status(500).json({ success: false, message: "Failed to update trip location" });
  }
}

export async function addTime(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const tripId = resolveTripId(req);
    const extraMinutes = parsePositiveInt(req.body?.extraMinutes);

    if (!tripId) {
      return res.status(400).json({ success: false, message: "tripId is required" });
    }

    if (!extraMinutes) {
      return res.status(400).json({ success: false, message: "extraMinutes must be a positive integer" });
    }

    const tripRepo = AppDataSource.getRepository("TripSession");
    const trip = await getOwnedTripOrThrow({ tripId, userId, tripRepo });

    if (trip.status !== TRIP_SESSION_STATUS.ACTIVE) {
      return res.status(409).json({ success: false, message: "Only ACTIVE trips can be extended" });
    }

    trip.expectedEndTime = new Date(new Date(trip.expectedEndTime).getTime() + extraMinutes * 60 * 1000);
    const updatedTrip = await tripRepo.save(trip);

    // Reset timer so auto-SOS uses the extended expected end time.
    scheduleAutoSos(updatedTrip);

    return res.status(200).json({
      success: true,
      message: "Trip time updated",
      data: {
        tripId: updatedTrip.id,
        extraMinutes,
        expectedEndTime: updatedTrip.expectedEndTime,
      },
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    console.error("ADD_TRIP_TIME_ERROR", error);
    return res.status(500).json({ success: false, message: "Failed to add trip time" });
  }
}

export async function endTripSafe(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const tripId = resolveTripId(req);
    if (!tripId) {
      return res.status(400).json({ success: false, message: "tripId is required" });
    }

    const tripRepo = AppDataSource.getRepository("TripSession");
    const trip = await getOwnedTripOrThrow({ tripId, userId, tripRepo });

    if (trip.status !== TRIP_SESSION_STATUS.ACTIVE) {
      return res.status(409).json({ success: false, message: "Only ACTIVE trips can be ended safely" });
    }

    trip.status = TRIP_SESSION_STATUS.SAFE;
    const updatedTrip = await tripRepo.save(trip);
    // SAFE completion cancels any pending escalation timer.
    clearTripTimer(updatedTrip.id);

    return res.status(200).json({
      success: true,
      message: "Trip marked as SAFE",
      data: {
        tripId: updatedTrip.id,
        status: updatedTrip.status,
        updatedAt: updatedTrip.updatedAt,
      },
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    console.error("END_TRIP_SAFE_ERROR", error);
    return res.status(500).json({ success: false, message: "Failed to end trip safely" });
  }
}

export async function triggerSOS(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const tripId = resolveTripId(req);
    if (!tripId) {
      return res.status(400).json({ success: false, message: "tripId is required" });
    }

    const tripRepo = AppDataSource.getRepository("TripSession");
    const trip = await getOwnedTripOrThrow({ tripId, userId, tripRepo });

    if (trip.status === TRIP_SESSION_STATUS.SOS) {
      return res.status(409).json({ success: false, message: "SOS already triggered for this trip" });
    }

    trip.status = TRIP_SESSION_STATUS.SOS;
    const updatedTrip = await tripRepo.save(trip);
    clearTripTimer(updatedTrip.id);

    // Manual SOS path uses the same escalation placeholder for now.
    await escalateToEmergencyContacts({
      tripId: updatedTrip.id,
      userId: updatedTrip.userId,
      contactIds: updatedTrip.contactIds || [],
    });

    return res.status(200).json({
      success: true,
      message: "SOS triggered",
      data: {
        tripId: updatedTrip.id,
        status: updatedTrip.status,
        updatedAt: updatedTrip.updatedAt,
      },
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }

    console.error("TRIGGER_SOS_ERROR", error);
    return res.status(500).json({ success: false, message: "Failed to trigger SOS" });
  }
}

// Public endpoint used by the shared tracking link shown to emergency contacts.
export async function getPublicTripTracking(req, res) {
  try {
    // Accept both /tracking/:trackingId and /tracking?trackingId=... forms.
    const trackingId = resolveTrackingId(req);

    if (!trackingId) {
      return sendError(res, 400, "trackingId is required");
    }

    if (!isValidTrackingId(trackingId)) {
      return sendError(res, 400, "Invalid trackingId format");
    }

    const tripRepo = AppDataSource.getRepository("TripSession");
    const trip = await tripRepo.findOneBy({ trackingId });

    if (!trip) {
      return sendError(res, 404, "Trip tracking session not found");
    }

    // Public tracking should always be fresh and never cached by intermediaries.
    setNoCacheHeaders(res);

    return res.status(200).json({
      success: true,
      message: "Trip tracking data fetched",
      data: buildPublicTrackingPayload(trip),
    });
  } catch (error) {
    console.error("GET_PUBLIC_TRIP_TRACKING_ERROR", error);
    return sendError(res, 500, "Failed to fetch trip tracking data");
  }
}
