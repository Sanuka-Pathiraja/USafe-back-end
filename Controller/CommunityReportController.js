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

export const createCommunityReport = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("CommunityReport");
    const userRepo = AppDataSource.getRepository("User");
    const { reportContent, reportDate_time, location } = req.body;

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
        userId: report.user?.id,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
    const reports = await repo.find({
      select: {
        reportId: true,
        reportDate_time: true,
        location: true,
      },
      take: 200,
      order: { reportDate_time: "DESC" },
    });

    const radiusKm = 2;
    let nearbyCount = 0;
    let recentNearbyCount = 0;
    const now = Date.now();
    const recentWindowMs = 24 * 60 * 60 * 1000;

    for (const report of reports) {
      const point = extractCoordinates(report.location);
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
    const finalScore = clampScore(100 - nearbyPenalty - recentPenalty);

    console.log("✅ SAFETY SCORE CALCULATED: ", finalScore);

    return res.status(200).json({
      success: true,
      finalScore,
      factors: {
        radiusKm,
        nearbyCount,
        recentNearbyCount,
      },
    });
  } catch (error) {
    console.error("❌ SAFETY SCORE ERROR: ", error.message);
    return res.status(500).json({ success: false, message: "Failed to calculate live safety score" });
  }
};
