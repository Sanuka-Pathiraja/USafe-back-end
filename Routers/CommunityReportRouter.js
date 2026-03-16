import express from "express";
import {
  createCommunityReport,
  getMyCommunityReports,
  getCommunityReportDetails,
  getLiveSafetyScore,
  deleteCommunityReport,
} from "../Controller/CommunityReportController.js";
import multer from "multer";
// import { authMiddleware } from "../middleware/authMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";

const communityReportRouter = express.Router();

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

// Use upload.array if multiple images
communityReportRouter.post("/add", authMiddleware, upload.array("images_proofs"), createCommunityReport);
communityReportRouter.get("/my-reports", authMiddleware, getMyCommunityReports);
communityReportRouter.post("/live-safety-score", authMiddleware, getLiveSafetyScore);
communityReportRouter.get("/live-safety-score", authMiddleware, getLiveSafetyScore);
communityReportRouter.get("/:reportId", authMiddleware, getCommunityReportDetails);
communityReportRouter.delete("/:reportId", authMiddleware, deleteCommunityReport);

export default communityReportRouter;
