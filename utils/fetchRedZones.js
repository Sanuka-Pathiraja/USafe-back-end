import supabase from "./supabaseClient.js";

const REDZONE_RADIUS = 50;

async function fetchRedZones() {
  const { data, error } = await supabase
    .from("community_reports")
    .select("locationCoordinates");

  if (error) {
    throw new Error("Failed to fetch redzones");
  }

  const redZones = data.map((row) => ({
    lat: row.locationCoordinates.lat,
    lon: row.locationCoordinates.lng,
    radius: REDZONE_RADIUS,
  }));

  return redZones;
}

export default fetchRedZones;