import crypto from "crypto";
import AppDataSource from "../config/data-source.js";
import { sendSms } from "../services/SmsService.js";
import { TRIP_SESSION_STATUS } from "../Model/TripSession.js";

// In-process timer registry for auto-SOS. Move to a persistent queue for multi-instance deployments.
const tripTimeouts = new Map();

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

function isValidTrackingId(trackingId) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(trackingId);
}

function buildPublicTrackingPayload(trip) {
  const isTrackingActive = trip.status === TRIP_SESSION_STATUS.ACTIVE;
  const isTerminal = trip.status === TRIP_SESSION_STATUS.SAFE || trip.status === TRIP_SESSION_STATUS.SOS;

  return {
    trackingId: trip.trackingId,
    tripName: trip.tripName,
    status: trip.status,
    isTrackingActive,
    isTerminal,
    expectedEndTime: trip.expectedEndTime,
    lastKnownLat: trip.lastKnownLat,
    lastKnownLng: trip.lastKnownLng,
    updatedAt: trip.updatedAt,
  };
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

// Placeholder hook for future escalation provider integration.
async function escalateToEmergencyContacts({ tripId, contactIds }) {
  console.log(
    JSON.stringify({
      event: "TRIP_SOS_ESCALATION_PLACEHOLDER",
      tripId,
      contactIds,
      at: new Date().toISOString(),
    })
  );
}

function clearTripTimer(tripId) {
  const existing = tripTimeouts.get(tripId);
  if (!existing) return;

  clearTimeout(existing);
  tripTimeouts.delete(tripId);
}

function scheduleAutoSos(tripSession) {
  clearTripTimer(tripSession.id);

  const msUntilExpiry = Math.max(0, new Date(tripSession.expectedEndTime).getTime() - Date.now());
  const timeoutHandle = setTimeout(async () => {
    try {
      const tripRepo = AppDataSource.getRepository("TripSession");
      const latestTrip = await tripRepo.findOneBy({ id: tripSession.id });
      if (!latestTrip || latestTrip.status !== TRIP_SESSION_STATUS.ACTIVE) {
        clearTripTimer(tripSession.id);
        return;
      }

      // Session timed out without safe completion, so escalate automatically.
      latestTrip.status = TRIP_SESSION_STATUS.SOS;
      await tripRepo.save(latestTrip);
      await escalateToEmergencyContacts({ tripId: latestTrip.id, contactIds: latestTrip.contactIds || [] });
      clearTripTimer(latestTrip.id);
    } catch (error) {
      console.error("AUTO_SOS_TIMER_ERROR", error);
    }
  }, msUntilExpiry);

  tripTimeouts.set(tripSession.id, timeoutHandle);
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

    if (!safeDurationMinutes) {
      return res.status(400).json({ success: false, message: "durationMinutes must be a positive integer" });
    }

    if (safeContactIds.length === 0) {
      return res.status(400).json({ success: false, message: "contactIds must contain at least one valid contact ID" });
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
    const trackingId = resolveTrackingId(req);

    if (!trackingId) {
      return res.status(400).json({ success: false, message: "trackingId is required" });
    }

    if (!isValidTrackingId(trackingId)) {
      return res.status(400).json({ success: false, message: "Invalid trackingId format" });
    }

    const tripRepo = AppDataSource.getRepository("TripSession");
    const trip = await tripRepo.findOneBy({ trackingId });

    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip tracking session not found" });
    }

    // Public tracking should always be fresh and never cached by intermediaries.
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    return res.status(200).json({
      success: true,
      message: "Trip tracking data fetched",
      data: buildPublicTrackingPayload(trip),
    });
  } catch (error) {
    console.error("GET_PUBLIC_TRIP_TRACKING_ERROR", error);
    return res.status(500).json({ success: false, message: "Failed to fetch trip tracking data" });
  }
}
