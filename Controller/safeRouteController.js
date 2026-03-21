import axios from "axios";

import circleToPolygon from "../utils/circlePolygon.js";
import routeIntersectsZones from "../utils/zoneChecker.js";
import fetchRedZones from "../utils/fetchRedZones.js";

// Offset a waypoint perpendicular to the route to avoid a redzone
function computeAvoidanceWaypoint(zone, start, end) {
  const OFFSET_METERS = 300;
  const METERS_PER_DEG_LAT = 111320;
  const METERS_PER_DEG_LON = 111320 * Math.cos(zone.lat * Math.PI / 180);

  const dx = end.lon - start.lon;
  const dy = end.lat - start.lat;

  const perpLat =  dx / Math.sqrt(dx * dx + dy * dy);
  const perpLon = -dy / Math.sqrt(dx * dx + dy * dy);

  const wp1 = {
    lat: zone.lat + perpLat * (OFFSET_METERS / METERS_PER_DEG_LAT),
    lon: zone.lon + perpLon * (OFFSET_METERS / METERS_PER_DEG_LON),
  };
  const wp2 = {
    lat: zone.lat - perpLat * (OFFSET_METERS / METERS_PER_DEG_LAT),
    lon: zone.lon - perpLon * (OFFSET_METERS / METERS_PER_DEG_LON),
  };

  return [wp1, wp2];
}

const getSafeRoute = async (req, res) => {
  try {

    const start = { lat:	6.9269, lon: 		79.8658};
    const end   = { lat: 		6.9279, lon: 		79.8631 };

    const redZones = await fetchRedZones();
    if (redZones.length === 0) {
      console.log("ℹ️  No redzones active — all routes are safe by default.");
    }