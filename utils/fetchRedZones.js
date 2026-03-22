import supabase from "./supabaseClient.js";

const REDZONE_RADIUS = 50; // hardcoded radius in meters

async function fetchRedZones() {
  const { data, error } = await supabase
    .from("community_reports")
    .select("locationCoordinates")
    .not("locationCoordinates", "is", null);

  if (error) {
    console.error("❌ Failed to fetch redzones from Supabase:", JSON.stringify(error));
    throw new Error("Could not load redzones from database.");
  }

  if (!data || data.length === 0) {
    console.warn("⚠️ No redzones found in the database.");
    return [];
  }

  const redZones = data.map((row) => ({
    lat:    row.locationCoordinates.lat,
    lon:    row.locationCoordinates.lng,
    radius: REDZONE_RADIUS,
  }));

  console.log(`✅ Loaded ${redZones.length} redzone(s) from Supabase.`);
  return redZones;
}

export default fetchRedZones;
