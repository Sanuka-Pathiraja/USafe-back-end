import supabase from "./supabaseClient.js";

async function fetchRedZones() {
  const { data, error } = await supabase
    .from("community_reports")
    .select("locationCoordinates");

  if (error) {
    throw new Error("Failed to fetch redzones");
  }

  return data;
}

export default fetchRedZones;