import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import AppDataSource from "../config/data-source.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export async function getGuardianSelfCheck(req, res) {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    safePath: {
      db: { ok: false },
      sms: { ok: false },
      scorer: { ok: false },
      trips: {
        expirySweepMs: Number(process.env.TRIP_EXPIRY_SWEEP_MS || 15000),
      },
    },
  };

  try {
    await AppDataSource.query("SELECT 1");
    diagnostics.safePath.db = { ok: true };
  } catch (error) {
    diagnostics.safePath.db = {
      ok: false,
      ...(IS_PRODUCTION ? {} : { error: error.message }),
    };
  }

  const hasSmsCreds = Boolean(process.env.QUICKSEND_EMAIL && process.env.QUICKSEND_API_KEY);
  diagnostics.safePath.sms = {
    ok: hasSmsCreds,
    provider: "QuickSend",
  };

  const scorerScriptPath = path.join(__dirname, "../safety_score.py");
  diagnostics.safePath.scorer = {
    ok: fs.existsSync(scorerScriptPath),
    scriptPath: scorerScriptPath,
    pythonExecutable: process.env.PYTHON_EXECUTABLE || "python",
  };

  const allHealthy =
    diagnostics.safePath.db.ok &&
    diagnostics.safePath.sms.ok &&
    diagnostics.safePath.scorer.ok;

  return res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    diagnostics,
  });
}

export function getSafetyScore(req, res) {
  const coordinateSources = [
    req.query || {},
    req.body || {},
    req.body?.location || {},
    req.body?.coords || {},
  ];

  const getCoordinate = (keys) => {
    for (const source of coordinateSources) {
      for (const key of keys) {
        if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== "") {
          return source[key];
        }
      }
    }
    return undefined;
  };

  const lat = getCoordinate(["lat", "latitude"]);
  const lng = getCoordinate(["lng", "lon", "long", "longitude"]);
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return res.status(400).json({
      error: "Missing lat/lng",
      expected: {
        query: ["lat", "lng"],
        bodyExamples: [
          { lat: 6.9271, lng: 79.8612 },
          { latitude: 6.9271, longitude: 79.8612 },
          { location: { lat: 6.9271, lng: 79.8612 } },
        ],
      },
    });
  }

  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
    return res.status(400).json({ error: "Invalid lat/lng range" });
  }

  const pythonBin = process.env.PYTHON_EXECUTABLE || "python";

  const pythonProcess = spawn(pythonBin, [
    path.join(__dirname, "../safety_score.py"),
    String(parsedLat),
    String(parsedLng),
  ]);

  let dataString = "";
  let errorString = "";
  let settled = false;

  const rawTimeoutMs = Number(process.env.SAFETY_SCORE_TIMEOUT_MS || 25000);
  const timeoutMs = Number.isFinite(rawTimeoutMs)
    ? Math.min(Math.max(rawTimeoutMs, 1000), 30000)
    : 25000;
  const timeoutHandle = setTimeout(() => {
    if (!settled) {
      pythonProcess.kill("SIGTERM");
      settled = true;
      return res.status(504).json({ error: "Safety scoring timed out" });
    }
  }, timeoutMs);

  pythonProcess.stdout.on("data", (data) => {
    dataString += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorString += data.toString();
  });

  pythonProcess.on("error", (error) => {
    if (!settled) {
      settled = true;
      clearTimeout(timeoutHandle);
      return res.status(500).json({
        error: "Failed to start safety scoring",
        ...(IS_PRODUCTION ? {} : { details: error.message }),
      });
    }
  });

  pythonProcess.on("close", (code) => {
    if (settled) {
      return;
    }

    clearTimeout(timeoutHandle);

    if (code !== 0) {
      settled = true;
      return res.status(502).json({
        error: "Safety scoring failed",
        ...(IS_PRODUCTION
          ? {}
          : {
              details: errorString.trim() || `Scorer exited with code ${code}`,
            }),
      });
    }

    try {
      const result = JSON.parse(dataString);
      settled = true;
      return res.status(200).json(result);
    } catch (e) {
      if (errorString) {
        console.error("Python error:", errorString.trim());
      }
      settled = true;
      return res.status(502).json({
        error: "Safety scoring failed",
        ...(IS_PRODUCTION
          ? {}
          : {
              details: errorString.trim() || "Invalid scorer response",
            }),
      });
    }
  });
}
