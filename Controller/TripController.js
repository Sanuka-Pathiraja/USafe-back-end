import crypto from "crypto";
import AppDataSource from "../config/data-source.js";
import {
  sendSms,
  buildStartMessage,
  buildSafeMessage,
  buildEmergencyMessage,
} from "../services/SmsService.js";

// In-memory timers. For production-grade reliability across restarts, move this to a persistent queue.
const activeTripsByUserId = new Map();

function normalizeLocation(raw) {
  if (!raw) return null;
  const lat = Number(raw.latitude ?? raw.lat);
  const lng = Number(raw.longitude ?? raw.lng ?? raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

function toMapsLink(location) {
  if (!location) return "Location unavailable";
  return `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
}

function normalizeContacts(rawContacts) {
  if (!Array.isArray(rawContacts)) return [];

  return rawContacts
    .map((item, index) => {
      if (typeof item === "string") {
        const phone = item.trim();
        if (!phone) return null;
        return { phone, name: `Emergency Contact ${index + 1}` };
      }

      if (item && typeof item === "object") {
        const phone = String(item.phone || item.to || "").trim();
        if (!phone) return null;
        const name = String(item.name || item.contactName || `Emergency Contact ${index + 1}`).trim();
        return { phone, name: name || `Emergency Contact ${index + 1}` };
      }

      return null;
    })
    .filter(Boolean);
}

async function resolveUserName(req) {
  const fallback = req.user?.email || "User";
  const userId = req.user?.id;
  if (!userId) return fallback;

  try {
    const userRepo = AppDataSource.getRepository("User");
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) return fallback;
    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    return fullName || user.email || fallback;
  } catch {
    return fallback;
  }
}

function clearTripTimer(userId) {
  const trip = activeTripsByUserId.get(userId);
  if (!trip) return null;
  if (trip.timeoutHandle) clearTimeout(trip.timeoutHandle);
  activeTripsByUserId.delete(userId);
  return trip;
}

async function sendEmergencyToContacts(trip) {
  const userName = trip.userName;
  const mapsLink = toMapsLink(trip.lastKnownLocation || trip.startLocation);

  const results = await Promise.allSettled(
    trip.emergencyContacts.map((contact) =>
      sendSms({
        to: contact.phone,
        body: buildEmergencyMessage({
          userName,
          tripName: trip.tripName,
          mapsLink,
        }),
      })
    )
  );

  return results.map((r, i) => ({
    to: trip.emergencyContacts[i].phone,
    ok: r.status === "fulfilled",
    error: r.status === "rejected" ? (r.reason?.message || String(r.reason)) : null,
  }));
}

function scheduleTripTimeout(userId) {
  const trip = activeTripsByUserId.get(userId);
  if (!trip) return;

  if (trip.timeoutHandle) clearTimeout(trip.timeoutHandle);

  const msUntilExpiry = Math.max(0, trip.expiresAt - Date.now());
  trip.timeoutHandle = setTimeout(async () => {
    const current = activeTripsByUserId.get(userId);
    if (!current || current.status !== "ACTIVE") return;

    current.status = "EXPIRED";
    current.expiredAt = Date.now();

    const smsResults = await sendEmergencyToContacts(current);
    current.emergencyDispatch = {
      triggered: true,
      at: new Date().toISOString(),
      results: smsResults,
    };

    activeTripsByUserId.set(userId, current);
  }, msUntilExpiry);
}

export async function startTrip(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { tripName, durationMinutes, emergencyContacts, startLocation } = req.body || {};

    const safeTripName = String(tripName || "").trim();
    const safeDuration = Number(durationMinutes);
    const contacts = normalizeContacts(emergencyContacts);
    const normalizedStartLocation = normalizeLocation(startLocation);

    if (!safeTripName) {
      return res.status(400).json({ success: false, message: "tripName is required" });
    }
    if (!Number.isFinite(safeDuration) || safeDuration <= 0) {
      return res.status(400).json({ success: false, message: "durationMinutes must be a positive number" });
    }
    if (contacts.length === 0) {
      return res.status(400).json({ success: false, message: "emergencyContacts must contain at least one phone number" });
    }

    // One active trip per user. Starting a new one replaces the old timer.
    clearTripTimer(userId);

    const userName = await resolveUserName(req);
    const now = Date.now();

    const trip = {
      tripId: crypto.randomUUID(),
      userId,
      userName,
      tripName: safeTripName,
      durationMinutes: safeDuration,
      emergencyContacts: contacts,
      startLocation: normalizedStartLocation,
      lastKnownLocation: normalizedStartLocation,
      startedAt: now,
      expiresAt: now + safeDuration * 60 * 1000,
      timeoutHandle: null,
      status: "ACTIVE",
      emergencyDispatch: { triggered: false },
    };

    activeTripsByUserId.set(userId, trip);
    scheduleTripTimeout(userId);

    const smsResults = await Promise.allSettled(
      contacts.map((contact) =>
        sendSms({
          to: contact.phone,
          body: buildStartMessage({
            contactName: contact.name,
            userName,
            tripName: safeTripName,
            durationMinutes: safeDuration,
          }),
        })
      )
    );

    const startNotifications = smsResults.map((r, i) => ({
      to: contacts[i].phone,
      ok: r.status === "fulfilled",
      error: r.status === "rejected" ? (r.reason?.message || String(r.reason)) : null,
    }));

    return res.status(200).json({
      success: true,
      message: "Trip started and server-side timer is active",
      tripId: trip.tripId,
      tripName: trip.tripName,
      startedAt: new Date(trip.startedAt).toISOString(),
      expiresAt: new Date(trip.expiresAt).toISOString(),
      notifications: startNotifications,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function markTripSafe(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const trip = clearTripTimer(userId);
    if (!trip || trip.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "No active trip found" });
    }

    trip.status = "SAFE";
    const safeAt = Date.now();

    const smsResults = await Promise.allSettled(
      trip.emergencyContacts.map((contact) =>
        sendSms({
          to: contact.phone,
          body: buildSafeMessage({
            userName: trip.userName,
            tripName: trip.tripName,
          }),
        })
      )
    );

    const safeNotifications = smsResults.map((r, i) => ({
      to: trip.emergencyContacts[i].phone,
      ok: r.status === "fulfilled",
      error: r.status === "rejected" ? (r.reason?.message || String(r.reason)) : null,
    }));

    return res.status(200).json({
      success: true,
      message: "Active trip marked safe and timer cancelled",
      tripId: trip.tripId,
      safeAt: new Date(safeAt).toISOString(),
      notifications: safeNotifications,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function addTripTime(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const trip = activeTripsByUserId.get(userId);
    if (!trip || trip.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "No active trip found" });
    }

    trip.expiresAt += 15 * 60 * 1000;
    activeTripsByUserId.set(userId, trip);
    scheduleTripTimeout(userId);

    return res.status(200).json({
      success: true,
      message: "Added 15 minutes to active trip timer",
      tripId: trip.tripId,
      expiresAt: new Date(trip.expiresAt).toISOString(),
      minutesAdded: 15,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateTripLocation(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const trip = activeTripsByUserId.get(userId);
    if (!trip || trip.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "No active trip found" });
    }

    const location = normalizeLocation(req.body || {});
    if (!location) {
      return res.status(400).json({ success: false, message: "latitude and longitude are required" });
    }

    trip.lastKnownLocation = location;
    trip.lastLocationUpdatedAt = Date.now();
    activeTripsByUserId.set(userId, trip);

    return res.status(200).json({
      success: true,
      message: "Last known location updated",
      tripId: trip.tripId,
      lastKnownLocation: trip.lastKnownLocation,
      updatedAt: new Date(trip.lastLocationUpdatedAt).toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export function getTripDebugState(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  const trip = activeTripsByUserId.get(userId);
  if (!trip) return res.status(404).json({ success: false, message: "No active trip found" });

  return res.status(200).json({
    success: true,
    trip: {
      tripId: trip.tripId,
      tripName: trip.tripName,
      status: trip.status,
      startedAt: new Date(trip.startedAt).toISOString(),
      expiresAt: new Date(trip.expiresAt).toISOString(),
      lastKnownLocation: trip.lastKnownLocation,
      emergencyDispatch: trip.emergencyDispatch,
    },
  });
}
