import AppDataSource from "../config/data-source.js";
import { getEnvironmentalData } from "./LocationIntelligenceService.js";

export const calculateSafetyScore = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const {
            batteryLevel = 100,
            isLocationEnabled = true,
            isMicrophoneEnabled = true,
            isToneSosActive = false,
            isSafePathActive = false,
            localTime,
            latitude = 6.9271,
            longitude = 79.8612
        } = req.body;

        let score = 50;
        const actionableTips = [];

        // --- Time Modifiers ---
        const now = new Date(localTime || Date.now());
        const hour = now.getHours();
        const isGraveyardShift = (hour >= 1 && hour < 5);
        const isDaytime = (hour >= 7 && hour < 19);

        // --- 1. Preparation & Profile ---
        const contactRepo = AppDataSource.getRepository("Contact");
        const contactsCount = await contactRepo.count({ where: { user: { id: userId } } });
        if (contactsCount >= 3) score += 15;
        else if (contactsCount > 0) score += 5;

        // --- 2. Device Telemetry ---
        if (batteryLevel > 80) score += 10;
        else if (batteryLevel <= 15) { score -= 20; actionableTips.push("Critical battery! Charge immediately."); }
        if (isToneSosActive) score += 10;
        if (isSafePathActive) score += 15;

        // --- 3. Location Intelligence (Advanced) ---
        const envData = await getEnvironmentalData(latitude, longitude, localTime);
        const {
            distanceToPolice,
            isWellLit,
            recentIncidents,
            placesContext
        } = envData;

        // Police Proximity
        if (distanceToPolice <= 1000) score += 15;

        // Lighting & Incidents
        if (!isWellLit) score -= 15;
        if (recentIncidents > 1) score -= 15;

        // --- Places Context Rules ---
        const { isNearSafeHaven, safeHavenType, isNearIsolationZone, isolationType, isNearRiskZone, riskType } = placesContext;

        if (isNearSafeHaven) {
            score += 10;
            // actionableTips.push(`Safe haven nearby: ${safeHavenType.replace('_', ' ')}`);
        }

        if (isNearRiskZone) {
            score -= 10;
            actionableTips.push(`Nearby ${riskType.replace('_', ' ')} detected. Late-night crowds may increase risk.`);
        }

        // --- CRITICAL: Isolation Zone Penalty ---
        if (isNearIsolationZone) {
            if (isGraveyardShift) {
                score -= 40; // Severe penalty for nighttime isolation
                actionableTips.push(`CRITICAL: You are near an isolated area (${isolationType}) during graveyard hours. Move to a populated area immediately.`);
            } else {
                score -= 10;
                actionableTips.push(`You are in an isolated area (${isolationType}). Stay vigilant.`);
            }
        }

        // --- 4. Final Clamping ---
        if (isGraveyardShift) {
            let cap = 40;
            // Bonus for being exceptionally prepared/protected
            if (isSafePathActive && batteryLevel > 80 && distanceToPolice <= 1000) cap = 65;
            if (isNearSafeHaven && !isNearIsolationZone) cap += 5;

            if (score > cap) score = cap;
            if (score < 10) score = 10;
            actionableTips.unshift("Graveyard shift alert: Extremely high-risk hours.");
        } else if (isDaytime) {
            if (score < 55) score = 55;
        }

        score = Math.max(0, Math.min(score, 100));

        let status = "Caution";
        if (score >= 80) status = "Safe";
        else if (score < 50) status = "High Risk";

        res.json({
            score: Math.round(score),
            status,
            tips: actionableTips,
            details: { ...envData }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to calculate safety score" });
    }
};
