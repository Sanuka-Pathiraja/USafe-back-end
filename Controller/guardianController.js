import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getSafetyScore(req, res) {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: "Missing lat/lng" });
  }

  const pythonProcess = spawn("python", [
    path.join(__dirname, "../safety_score.py"),
    lat,
    lng,
  ]);

  let dataString = "";
  let errorString = "";

  pythonProcess.stdout.on("data", (data) => {
    dataString += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorString += data.toString();
  });

  pythonProcess.on("close", () => {
    try {
      const result = JSON.parse(dataString);
      return res.status(200).json(result);
    } catch (e) {
      if (errorString) {
        console.error("Python error:", errorString.trim());
      }
      return res.status(200).json({
        score: 60,
        note: "Fallback Mode",
        error: errorString.trim() || "Unknown Python failure",
      });
    }
  });
}
