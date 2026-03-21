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

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lon},${start.lat};${end.lon},${end.lat}`;

    const response = await axios.get(url, {
      params: {
        geometries: "geojson",
        access_token: process.env.MAPBOX_TOKEN,
        alternatives: true,
        overview: "full",
      },
    });
    if (!response.data.routes || response.data.routes.length === 0) {
      return res.status(404).json({ error: "No routes found" });
      
    }
    console.log(`\n📍 Found ${response.data.routes.length} route(s) from Mapbox`);

    const originalRoute       = response.data.routes[0];
    const originalRouteCoords = originalRoute.geometry.coordinates;
    const originalIsDangerous = routeIntersectsZones(originalRouteCoords, redZones);

    console.log(`\n🛣️ Original route is ${originalIsDangerous ? "DANGEROUS ❌" : "SAFE ✅"}`);

    let safeRoute     = null;
    let safeRouteData = null;

    // Step 1: Check Mapbox alternatives
    for (let i = 0; i < response.data.routes.length; i++) {
      const route = response.data.routes[i];
      console.log(`\nChecking route ${i + 1}:`);
      if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
        console.log(`✅ Route ${i + 1} is SAFE!`);
        safeRoute     = route.geometry.coordinates;
        safeRouteData = route;
        break;
  
