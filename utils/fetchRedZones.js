import supabase from "./supabaseClient.js";
import { classifyThreat } from "./threatClassifier.js";

async function fetchRedZones() {
  const { data, error } = await supabase
    .from("community_reports")
    .select("reportId, reportContent, reportDate_time, issueTypes, locationCoordinates, users(firstName, lastName)")
    .not("locationCoordinates", "is", null);

  if (error) {
    console.error("❌ Failed to fetch redzones from Supabase:", JSON.stringify(error));
    throw new Error("Could not load redzones from database.");
  }

  if (!data || data.length === 0) {
    console.warn("⚠️ No redzones found in the database.");
    return [];
  }

  const redZones = data.map((row) => {
    const { threatLevel, radius } = classifyThreat(row.issueTypes || []);
    const reporter = row.users
      ? `${row.users.firstName} ${row.users.lastName}`.trim()
      : "Anonymous";

    return {
      reportId:    row.reportId,
      lat:         row.locationCoordinates.lat,
      lon:         row.locationCoordinates.lng,
      radius,
      threatLevel,
      issueTypes:  row.issueTypes || [],
      description: row.reportContent || "",
      reportedAt:  row.reportDate_time,
      reporter,
    };
  });

  console.log(`✅ Loaded ${redZones.length} redzone(s) from Supabase.`);
  return redZones;
}

export default fetchRedZones;
