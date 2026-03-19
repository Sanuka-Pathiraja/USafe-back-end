import AppDataSource from "../config/data-source.js";
import fs from "fs";
import { supabase } from "../config/supabase.js";

function parseCoordinateValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractCoordinates(locationRaw) {
  if (typeof locationRaw !== "string") return null;
  const text = locationRaw.trim();
  if (!text) return null;

  // Supports: "6.9,79.8" and map URLs like "...@6.9,79.8" or "...q=6.9,79.8"
  const pairMatch = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!pairMatch) return null;

  const lat = parseCoordinateValue(pairMatch[1]);
  const lng = parseCoordinateValue(pairMatch[2]);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function normalizeCoordinatesObject(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const lat = parseCoordinateValue(raw.lat ?? raw.latitude);
  const lng = parseCoordinateValue(raw.lng ?? raw.lon ?? raw.longitude ?? raw.long);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function parseLocationCoordinatesInput(body = {}) {
  const directObject = normalizeCoordinatesObject(body.locationCoordinates ?? body.coordinates);
  if (directObject) return directObject;

  const jsonLikeSources = [
    body.locationCoordinates,
    body.coordinates,
  ];

  for (const source of jsonLikeSources) {
    if (typeof source !== "string") continue;
    const text = source.trim();
    if (!text) continue;

    try {
      const parsed = JSON.parse(text);
      const normalized = normalizeCoordinatesObject(parsed);
      if (normalized) return normalized;
    } catch {
      const extracted = extractCoordinates(text);
      if (extracted) return extracted;
    }
  }

  const flatObject = normalizeCoordinatesObject({
    lat: body.locationLat ?? body.latitude ?? body.lat,
    lng: body.locationLng ?? body.longitude ?? body.lng ?? body.lon,
  });

  return flatObject;
}

function hasLocationCoordinateInput(body = {}) {
  const candidateValues = [
    body.locationCoordinates,
    body.coordinates,
    body.locationLat,
    body.locationLng,
    body.latitude,
    body.longitude,
    body.lat,
    body.lng,
    body.lon,
  ];

  return candidateValues.some((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function getReportCoordinates(report) {
  const direct = normalizeCoordinatesObject(report?.locationCoordinates);
  if (direct) return direct;
  return extractCoordinates(report?.location);
}

async function getSafetyScoreReports(repo) {
  try {
    return await repo.find({
      select: {
        reportId: true,
        reportDate_time: true,
        location: true,
        locationCoordinates: true,
      },
      take: 200,
      order: { reportDate_time: "DESC" },
    });
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const missingCoordinatesColumn =
      message.includes("locationcoordinates") ||
      (message.includes("column") && message.includes("does not exist"));

    if (!missingCoordinatesColumn) {
      throw error;
    }

    console.warn("Safety score fallback: locationCoordinates column not available yet, using legacy location parsing only.");

    const legacyReports = await repo.find({
      select: {
        reportId: true,
        reportDate_time: true,
        location: true,
      },
      take: 200,
      order: { reportDate_time: "DESC" },
    });

    return legacyReports.map((report) => ({
      ...report,
      locationCoordinates: null,
    }));
  }
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(aLat, aLng, bLat, bLng) {
  const earthRadiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function deriveSafetyStatus(score) {
  if (score >= 80) return "Safe";
  if (score >= 60) return "Caution";
  if (score >= 40) return "Risky";
  return "Danger";
}

function deriveTimeOfDayLabel(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}

function getTimePenalty(timeOfDay) {
  if (timeOfDay === "Night") return 12;
  if (timeOfDay === "Evening") return 6;
  return 0;
}

function toBatteryPercent(rawBatteryLevel) {
  if (rawBatteryLevel === undefined || rawBatteryLevel === null || String(rawBatteryLevel).trim() === "") return null;
  const value = Number(rawBatteryLevel);
  if (!Number.isFinite(value)) return null;
  if (value <= 1) return clampScore(value * 100);
  return clampScore(value);
}

function getBatteryPenalty(batteryPercent) {
  if (batteryPercent === null) return 0;
  if (batteryPercent < 10) return 15;
  if (batteryPercent < 20) return 10;
  if (batteryPercent < 35) return 5;
  return 0;
}

function getDistancePenalty(distanceKm) {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return 6;
  if (distanceKm > 5) return 8;
  if (distanceKm > 3) return 5;
  if (distanceKm > 1.5) return 2;
  return 0;
}

function buildDummyDestination(lat, lng, distanceKm = 1) {
  // Move east by ~distanceKm to generate a stable nearby destination.
  const dLng = distanceKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    lat,
    lng: lng + dLng,
  };
}

function getTrafficPenalty(trafficRatio) {
  if (!Number.isFinite(trafficRatio) || trafficRatio <= 0) return 5;
  if (trafficRatio >= 2) return 0;
  if (trafficRatio >= 1.5) return 2;
  if (trafficRatio >= 1.2) return 4;
  return 7;
}

function getDensityPenalty(openNowCount) {
  if (!Number.isFinite(openNowCount) || openNowCount < 0) return 8;
  if (openNowCount >= 20) return 0;
  if (openNowCount >= 10) return 3;
  if (openNowCount >= 5) return 6;
  if (openNowCount >= 1) return 10;
  return 15;
}

function normalizeSignalStatus(rawSignal) {
  if (rawSignal === undefined || rawSignal === null) return null;
  const text = String(rawSignal).trim().toLowerCase();
  return text || null;
}

function getSignalPenalty(signalStatus) {
  if (!signalStatus) return 0;
  if (["none", "offline", "no-signal", "no_signal", "disconnected"].includes(signalStatus)) return 18;
  if (["weak", "poor", "2g", "edge"].includes(signalStatus)) return 12;
  if (["moderate", "3g", "fair"].includes(signalStatus)) return 6;
  if (["strong", "excellent", "4g", "5g", "wifi"].includes(signalStatus)) return 0;
  return 4;
}

function getWeatherPenalty(weatherCode) {
  if (!Number.isFinite(weatherCode)) return 5;
  if (weatherCode >= 200 && weatherCode < 300) return 10; // thunderstorm
  if (weatherCode >= 300 && weatherCode < 400) return 6; // drizzle
  if (weatherCode >= 500 && weatherCode < 600) return 7; // rain
  if (weatherCode >= 600 && weatherCode < 700) return 8; // snow
  if (weatherCode >= 700 && weatherCode < 800) return 10; // fog/haze/smoke
  if (weatherCode === 800) return 0; // clear
  if (weatherCode > 800 && weatherCode < 900) return 3; // clouds
  return 4;
}

function getCrimePenalty(violentCount) {
  if (!Number.isFinite(violentCount) || violentCount < 0) return 8;
  if (violentCount >= 10) return 20;
  if (violentCount >= 6) return 15;
  if (violentCount >= 3) return 10;
  if (violentCount >= 1) return 5;
  return 0;
}

function countViolentIncidents(incidents) {
  if (!Array.isArray(incidents)) return 0;
  const violentKeywords = ["assault", "homicide", "murder", "robbery", "rape", "kidnap", "weapon", "shoot", "stabbing", "violence"];
  return incidents.filter((item) => {
    const text = String(item?.type || item?.category || item?.title || item?.offense || "").toLowerCase();
    return violentKeywords.some((k) => text.includes(k));
  }).length;
}

async function fetchTrafficData({ lat, lng, apiKey }) {
  try {
    const destination = buildDummyDestination(lat, lng, 1);
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${lat},${lng}`);
    url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
    url.searchParams.set("departure_time", "now");
    url.searchParams.set("mode", "driving");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { status: `HTTP_${response.status}`, ratio: null, normalDurationSec: null, trafficDurationSec: null, message: "HTTP request failed" };
    }

    const data = await response.json();
    if (!data || data.status !== "OK") {
      return {
        status: data?.status || "REQUEST_FAILED",
        ratio: null,
        normalDurationSec: null,
        trafficDurationSec: null,
        message: data?.error_message || null,
      };
    }

    const leg = data?.routes?.[0]?.legs?.[0];
    const normalDurationSec = Number(leg?.duration?.value);
    const trafficDurationSec = Number(leg?.duration_in_traffic?.value);

    if (!Number.isFinite(normalDurationSec) || !Number.isFinite(trafficDurationSec) || normalDurationSec <= 0) {
      return { status: "MISSING_DURATION", ratio: null, normalDurationSec: null, trafficDurationSec: null, message: null };
    }

    return {
      status: "OK",
      ratio: trafficDurationSec / normalDurationSec,
      normalDurationSec,
      trafficDurationSec,
      message: null,
    };
  } catch (error) {
    return { status: "REQUEST_FAILED", ratio: null, normalDurationSec: null, trafficDurationSec: null, message: error?.message || String(error) };
  }
}

async function fetchPopulationDensity({ lat, lng, apiKey }) {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", "500");
    url.searchParams.set("opennow", "true");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { status: `HTTP_${response.status}`, openNowCount: null, message: "HTTP request failed" };
    }

    const data = await response.json();
    if (!data || (data.status && !["OK", "ZERO_RESULTS"].includes(data.status))) {
      return {
        status: data?.status || "REQUEST_FAILED",
        openNowCount: null,
        message: data?.error_message || null,
      };
    }

    const count = Array.isArray(data.results) ? data.results.length : 0;
    return {
      status: data.status || "OK",
      openNowCount: count,
      message: null,
    };
  } catch (error) {
    return { status: "REQUEST_FAILED", openNowCount: null, message: error?.message || String(error) };
  }
}

async function fetchWeatherData({ lat, lng, apiKey }) {
  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("appid", apiKey);

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { status: `HTTP_${response.status}`, weatherCode: null, description: null, message: "HTTP request failed" };
    }

    const data = await response.json();
    const weatherCode = Number(data?.weather?.[0]?.id);
    const description = data?.weather?.[0]?.description || null;
    if (!Number.isFinite(weatherCode)) {
      return { status: "MISSING_WEATHER_CODE", weatherCode: null, description: null, message: null };
    }

    return {
      status: "OK",
      weatherCode,
      description,
      message: null,
    };
  } catch (error) {
    return { status: "REQUEST_FAILED", weatherCode: null, description: null, message: error?.message || String(error) };
  }
}

async function fetchCrimeData({ lat, lng, apiKey }) {
  try {
    // API Ninjas reverse geocoding + crime flow.
    const reverseUrl = new URL("https://api.api-ninjas.com/v1/reversegeocoding");
    reverseUrl.searchParams.set("lat", String(lat));
    reverseUrl.searchParams.set("lon", String(lng));

    const reverseRes = await fetch(reverseUrl, {
      method: "GET",
      headers: { "X-Api-Key": apiKey },
    });

    if (!reverseRes.ok) {
      return { status: `HTTP_${reverseRes.status}`, city: null, region: null, violentCount: null, totalIncidents: null, message: "Reverse geocoding failed" };
    }

    const reverseData = await reverseRes.json();
    const loc = Array.isArray(reverseData) ? reverseData[0] : null;
    const city = loc?.city || null;
    const region = loc?.state || null;

    if (!city) {
      return { status: "CITY_NOT_FOUND", city: null, region: null, violentCount: null, totalIncidents: null, message: null };
    }

    const crimeUrl = new URL("https://api.api-ninjas.com/v1/crime");
    crimeUrl.searchParams.set("city", city);
    if (region) crimeUrl.searchParams.set("state", region);

    const crimeRes = await fetch(crimeUrl, {
      method: "GET",
      headers: { "X-Api-Key": apiKey },
    });

    if (!crimeRes.ok) {
      return { status: `HTTP_${crimeRes.status}`, city, region, violentCount: null, totalIncidents: null, message: "Crime API request failed" };
    }

    const crimeData = await crimeRes.json();
    const incidents = Array.isArray(crimeData) ? crimeData : [];
    const violentCount = countViolentIncidents(incidents);

    return {
      status: "OK",
      city,
      region,
      violentCount,
      totalIncidents: incidents.length,
      message: null,
    };
  } catch (error) {
    return {
      status: "REQUEST_FAILED",
      city: null,
      region: null,
      violentCount: null,
      totalIncidents: null,
      message: error?.message || String(error),
    };
  }
}

async function fetchNearestPlace({ lat, lng, type, apiKey }) {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("rankby", "distance");
    url.searchParams.set("type", type);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { name: "Data unavailable", distanceKm: null, providerStatus: `HTTP_${response.status}`, providerMessage: "HTTP request failed" };
    }

    const data = await response.json();
    if (!data || data.status === "ZERO_RESULTS") {
      return {
        name: "Data unavailable",
        distanceKm: null,
        providerStatus: "ZERO_RESULTS",
        providerMessage: data?.error_message || null,
      };
    }

    if (data.status && data.status !== "OK") {
      return {
        name: "Data unavailable",
        distanceKm: null,
        providerStatus: data.status,
        providerMessage: data.error_message || null,
      };
    }

    const first = Array.isArray(data.results) ? data.results[0] : null;
    const placeLat = first?.geometry?.location?.lat;
    const placeLng = first?.geometry?.location?.lng;

    if (!first || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {
      return { name: "Data unavailable", distanceKm: null, providerStatus: "MISSING_GEOMETRY", providerMessage: null };
    }

    const km = distanceKm(lat, lng, placeLat, placeLng);
    return {
      name: first.name || "Unknown",
      distanceKm: Math.round(km * 100) / 100,
      providerStatus: "OK",
      providerMessage: null,
    };
  } catch (error) {
    return {
      name: "Data unavailable",
      distanceKm: null,
      providerStatus: "REQUEST_FAILED",
      providerMessage: error?.message || String(error),
    };
  }
}

export const createCommunityReport = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("CommunityReport");
    const userRepo = AppDataSource.getRepository("User");
    const { reportContent, reportDate_time, location } = req.body;
    const locationCoordinates = parseLocationCoordinatesInput(req.body);

    if (!locationCoordinates) {
      return res.status(400).json({
        success: false,
        error: "locationCoordinates are required. Send numeric lat/lng values for the selected location.",
      });
    }

    if (hasLocationCoordinateInput(req.body) && !locationCoordinates) {
      return res.status(400).json({
        success: false,
        error: "Invalid location coordinates. Send numeric lat/lng values.",
      });
    }

    const userId = req.user.id;

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const images_proofs = [];

    if (req.files) {
      for (const file of req.files) {
        const fileStream = fs.createReadStream(file.path);
        const { data, error } = await supabase.storage.from("Report Images").upload(`reports/${file.filename}`, fileStream, { upsert: true });

        if (error) {
          console.error("Supabase upload error:", error);
        } else {
          const { data: urlData, error: urlError } = supabase.storage.from("Report Images").getPublicUrl(data.path);
          if (!urlError) images_proofs.push(urlData.publicUrl);
        }

        fs.unlinkSync(file.path);
      }
    }

    const report = repo.create({
      reportContent,
      reportDate_time,
      images_proofs,
      location,
      locationCoordinates,
      user,
    });

    await repo.save(report);

    res.status(201).json({
      success: true,
      message: "report saved successfully",
      report: {
        reportId: report.reportId,
        reportContent: report.reportContent,
        reportDate_time: report.reportDate_time,
        images_proofs: report.images_proofs,
        location: report.location,
        locationCoordinates: report.locationCoordinates,
        userId: user.id,
      },
    });
  } catch (err) {
    console.error("report saved unsuccessfully", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getMyCommunityReports = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("CommunityReport");
    const userId = req.user.id;

    const reports = await repo.find({
      where: { user: { id: userId } },
      relations: { user: true },
      order: { reportDate_time: "DESC" },
    });

    const mappedReports = reports.map((report) => ({
      reportId: report.reportId,
      reportContent: report.reportContent,
      reportDate_time: report.reportDate_time,
      images_proofs: report.images_proofs || [],
      location: report.location,
      locationCoordinates: report.locationCoordinates || null,
      userId: report.user?.id,
    }));

    res.json({
      success: true,
      total: mappedReports.length,
      reports: mappedReports,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getCommunityReportDetails = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("CommunityReport");
    const userId = req.user.id;
    const reportId = Number(req.params.reportId);

    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ success: false, error: "Invalid reportId" });
    }

    const report = await repo.findOne({
      where: { reportId, user: { id: userId } },
      relations: { user: true },
    });

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    res.json({
      success: true,
      report: {
        reportId: report.reportId,
        reportContent: report.reportContent,
        reportDate_time: report.reportDate_time,
        images_proofs: report.images_proofs || [],
        location: report.location,
        locationCoordinates: report.locationCoordinates || null,
        userId: report.user?.id,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteCommunityReport = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("CommunityReport");
    const userId = req.user.id;
    const reportId = Number(req.params.reportId);

    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid reportId" });
    }

    const report = await repo.findOne({
      where: { reportId, user: { id: userId } },
      relations: { user: true },
    });

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    await repo.remove(report);

    return res.status(200).json({ success: true, message: "Report deleted" });
  } catch (err) {
    console.error("Report delete failed", err);
    return res.status(500).json({ success: false, message: "Failed to delete report" });
  }
};

export const getLiveSafetyScore = async (req, res) => {
  console.log("📍 SAFETY SCORE REQUEST RECEIVED: ", req.body || req.query);

  try {
    const latInput = req.query?.lat ?? req.query?.latitude ?? req.body?.lat ?? req.body?.latitude;
    const lngInput = req.query?.lng ?? req.query?.longitude ?? req.body?.lng ?? req.body?.longitude;

    const lat = parseCoordinateValue(latInput);
    const lng = parseCoordinateValue(lngInput);

    if (lat === null || lng === null) {
      return res.status(400).json({
        success: false,
        message: "lat/lng (or latitude/longitude) are required as numeric values",
      });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinate range",
      });
    }

    const repo = AppDataSource.getRepository("CommunityReport");
    const reports = await getSafetyScoreReports(repo);

    const radiusKm = 2;
    let nearbyCount = 0;
    let recentNearbyCount = 0;
    const now = Date.now();
    const recentWindowMs = 24 * 60 * 60 * 1000;

    for (const report of reports) {
      const point = getReportCoordinates(report);
      if (!point) continue;

      const distance = distanceKm(lat, lng, point.lat, point.lng);
      if (distance <= radiusKm) {
        nearbyCount += 1;

        const reportTs = new Date(report.reportDate_time).getTime();
        if (Number.isFinite(reportTs) && now - reportTs <= recentWindowMs) {
          recentNearbyCount += 1;
        }
      }
    }

    const nearbyPenalty = nearbyCount * 8;
    const recentPenalty = recentNearbyCount * 12;

    const timeOfDay = deriveTimeOfDayLabel(new Date());
    const timePenalty = getTimePenalty(timeOfDay);

    const batteryLevelRaw = req.body?.batteryLevel ?? req.body?.battery_level ?? req.query?.batteryLevel ?? req.query?.battery_level;
    const batteryLevel = toBatteryPercent(batteryLevelRaw);
    const batteryPenalty = getBatteryPenalty(batteryLevel);

    const signalStatusRaw = req.body?.signalStatus ?? req.body?.signal_status ?? req.query?.signalStatus ?? req.query?.signal_status;
    const signalStatus = normalizeSignalStatus(signalStatusRaw);
    const signalPenalty = getSignalPenalty(signalStatus);

    const placesApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
    const openWeatherApiKey = process.env.OPENWEATHER_API_KEY || null;
    const crimeApiKey = process.env.CRIME_API_KEY || process.env.API_NINJAS_API_KEY || null;

    const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;

    let nearestPoliceStation = { name: "Data unavailable", distanceKm: null, providerStatus: "API_KEY_MISSING" };
    let nearestHospital = { name: "Data unavailable", distanceKm: null, providerStatus: "API_KEY_MISSING" };

    let trafficData = {
      status: "API_KEY_MISSING",
      ratio: null,
      normalDurationSec: null,
      trafficDurationSec: null,
      message: null,
    };

    let densityData = {
      status: "API_KEY_MISSING",
      openNowCount: null,
      message: null,
    };

    let weatherData = {
      status: "API_KEY_MISSING",
      weatherCode: null,
      description: null,
      message: null,
    };

    let crimeData = {
      status: "API_KEY_MISSING",
      city: null,
      region: null,
      violentCount: null,
      totalIncidents: null,
      message: null,
    };

    if (placesApiKey) {
      const [police, hospital] = await Promise.all([
        fetchNearestPlace({ lat, lng, type: "police", apiKey: placesApiKey }),
        fetchNearestPlace({ lat, lng, type: "hospital", apiKey: placesApiKey }),
      ]);
      nearestPoliceStation = police;
      nearestHospital = hospital;

      densityData = await fetchPopulationDensity({ lat, lng, apiKey: placesApiKey });
    }

    if (mapsApiKey) {
      trafficData = await fetchTrafficData({ lat, lng, apiKey: mapsApiKey });
    }

    if (openWeatherApiKey) {
      weatherData = await fetchWeatherData({ lat, lng, apiKey: openWeatherApiKey });
    }

    if (crimeApiKey) {
      crimeData = await fetchCrimeData({ lat, lng, apiKey: crimeApiKey });
    }

    const policePenalty = getDistancePenalty(nearestPoliceStation.distanceKm);
    const hospitalPenalty = getDistancePenalty(nearestHospital.distanceKm);
    const servicesPenalty = policePenalty + hospitalPenalty;

    const trafficPenalty = getTrafficPenalty(trafficData.ratio);
    const densityPenalty = getDensityPenalty(densityData.openNowCount);
    const weatherPenalty = getWeatherPenalty(weatherData.weatherCode);
    const crimePenalty = getCrimePenalty(crimeData.violentCount);

    const finalScore = clampScore(
      100 - nearbyPenalty - recentPenalty - timePenalty - batteryPenalty - servicesPenalty - trafficPenalty - densityPenalty - signalPenalty - weatherPenalty - crimePenalty
    );
    const status = deriveSafetyStatus(finalScore);

    console.log("✅ SAFETY SCORE CALCULATED: ", finalScore);

    return res.status(200).json({
      success: true,
      ok: true,
      message: "Live safety score calculated",
      finalScore,
      safetyScore: finalScore,
      safety_score: finalScore,
      score: finalScore,
      liveSafetyScore: finalScore,
      live_safety_score: finalScore,
      status,
      timeOfDay,
      time_of_day: timeOfDay,
      batteryLevel,
      battery_level: batteryLevel,
      nearestPoliceStation,
      nearest_police_station: nearestPoliceStation,
      nearestHospital,
      nearest_hospital: nearestHospital,
      traffic: {
        ratio: trafficData.ratio,
        normalDurationSec: trafficData.normalDurationSec,
        trafficDurationSec: trafficData.trafficDurationSec,
        providerStatus: trafficData.status,
        providerMessage: trafficData.message,
      },
      populationDensity: {
        openNowCount: densityData.openNowCount,
        providerStatus: densityData.status,
        providerMessage: densityData.message,
      },
      signal: {
        status: signalStatus,
      },
      weather: {
        weatherCode: weatherData.weatherCode,
        description: weatherData.description,
        providerStatus: weatherData.status,
        providerMessage: weatherData.message,
      },
      crime: {
        city: crimeData.city,
        region: crimeData.region,
        violentCount: crimeData.violentCount,
        totalIncidents: crimeData.totalIncidents,
        providerStatus: crimeData.status,
        providerMessage: crimeData.message,
      },
      factors: {
        radiusKm,
        nearbyCount,
        recentNearbyCount,
        penalties: {
          nearbyPenalty,
          recentPenalty,
          timePenalty,
          batteryPenalty,
          servicesPenalty,
          policePenalty,
          hospitalPenalty,
          trafficPenalty,
          densityPenalty,
          signalPenalty,
          weatherPenalty,
          crimePenalty,
        },
        providers: {
          placesProvider: placesApiKey ? "google-places" : "not-configured",
          trafficProvider: mapsApiKey ? "google-directions" : "not-configured",
          weatherProvider: openWeatherApiKey ? "openweather" : "not-configured",
          crimeProvider: crimeApiKey ? "api-ninjas" : "not-configured",
        },
      },
      data: {
        finalScore,
        safetyScore: finalScore,
        safety_score: finalScore,
        score: finalScore,
        status,
      },
      result: {
        finalScore,
        score: finalScore,
        safetyScore: finalScore,
        safety_score: finalScore,
      },
    });
  } catch (error) {
    console.error("❌ SAFETY SCORE ERROR: ", error.message);
    return res.status(500).json({ success: false, message: "Failed to calculate live safety score" });
  }
};
