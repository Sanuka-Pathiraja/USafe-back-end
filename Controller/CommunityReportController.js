import AppDataSource from "../config/data-source.js";
import fs from "fs";
import { supabase } from "../config/supabase.js";

export const createCommunityReport = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("CommunityReport");
    const userRepo = AppDataSource.getRepository("User");
    const { reportContent, reportDate_time } = req.body;

    // Get userId from authenticated user (from JWT token)
    const userId = req.user.id; // <-- Changed from req.body.userId

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

        fs.unlinkSync(file.path); // delete local file
      }
    }

    const report = repo.create({
      reportContent,
      reportDate_time,
      images_proofs,
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
        userId: user.id,
      },
    });
  } catch (err) {
    console.error("report saved unsuccessfully ❌", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
