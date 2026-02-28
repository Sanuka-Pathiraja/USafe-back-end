import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getSafetyScore(req, res) {
  const { lat, lng } = req.query;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return res.status(400).json({ error: "Missing lat/lng" });
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

  const timeoutMs = Number(process.env.SAFETY_SCORE_TIMEOUT_MS || 8000);
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
      return res.status(500).json({ error: "Failed to start safety scoring", details: error.message });
    }
  });

  pythonProcess.on("close", () => {
    if (settled) {
      return;
    }

    try {
      const result = JSON.parse(dataString);
      settled = true;
      clearTimeout(timeoutHandle);
      return res.status(200).json(result);
    } catch (e) {
      if (errorString) {
        console.error("Python error:", errorString.trim());
      }
      settled = true;
      clearTimeout(timeoutHandle);
      return res.status(502).json({
        error: "Safety scoring failed",
        details: errorString.trim() || "Invalid scorer response",
      });
    }
  });
}
