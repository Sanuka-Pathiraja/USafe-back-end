import AppDataSource from "../config/data-source.js";
import fs from "fs";
import { supabase } from "../config/supabase.js";

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
