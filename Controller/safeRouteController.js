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

    const start = { lat: 6.9221, lon: 	79.8668};
    const end   = { lat: 6.9207, lon: 		79.8621 };

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
      } else {
        console.log(`❌ Route ${i + 1} passes through danger zone`);
      }
    }

    // Step 2: Try exclude=toll
    if (!safeRoute && originalIsDangerous) {
      console.log("\n⚠️ Trying exclude=toll...");
      const tollResponse = await axios.get(url, {
        params: {
          geometries: "geojson",
          access_token: process.env.MAPBOX_TOKEN,
          alternatives: true,
          overview: "full",
          exclude: "toll",
        },
      });
      for (let route of tollResponse.data.routes) {
        if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
          safeRoute     = route.geometry.coordinates;
          safeRouteData = route;
          console.log("✅ Found safe route via exclude=toll!");
          break;
        }
      }
    }

    // Step 3: Waypoint-based avoidance
    if (!safeRoute && originalIsDangerous) {
      console.log("\n⚠️ Trying waypoint-based avoidance...");
      const hitZone = redZones.find(zone =>
        routeIntersectsZones(originalRouteCoords, [zone])
      );

      if (hitZone) {
        const waypoints = computeAvoidanceWaypoint(hitZone, start, end);
        for (const wp of waypoints) {
          console.log(`Trying waypoint: ${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)}`);
          const waypointUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lon},${start.lat};${wp.lon},${wp.lat};${end.lon},${end.lat}`;
          try {
            const wpResponse = await axios.get(waypointUrl, {
              params: {
                geometries: "geojson",
                access_token: process.env.MAPBOX_TOKEN,
                alternatives: true,
                overview: "full",
              },
            });
            for (let route of wpResponse.data.routes) {
              if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
                safeRoute     = route.geometry.coordinates;
                safeRouteData = route;
                console.log("✅ Found safe route via waypoint avoidance!");
                break;
              }
            }
          } catch (e) {
            console.log(`Waypoint request failed: ${e.message}`);
          }
          if (safeRoute) break;
        }
      }
    }

    // Build response
    const responseData = {
      start,
      end,
      redZones: redZones.map((zone) => ({
        center:  { lat: zone.lat, lon: zone.lon },
        radius:  zone.radius,
        polygon: circleToPolygon(zone.lon, zone.lat, zone.radius, 32).map(
          (coord) => ({ lat: coord[1], lon: coord[0] })
        ),
      })),
      originalRoute: {
        path:        originalRouteCoords.map((coord) => ({ lat: coord[1], lon: coord[0] })),
        distance:    originalRoute.distance,
        duration:    originalRoute.duration,
        isDangerous: originalIsDangerous,
        color:       originalIsDangerous ? "red" : "blue",
      },
      totalRoutesChecked: response.data.routes.length,
    };

    if (safeRoute && originalIsDangerous) {
      responseData.safeRoute = {
        path:        safeRoute.map((coord) => ({ lat: coord[1], lon: coord[0] })),
        distance:    safeRouteData.distance,
        duration:    safeRouteData.duration,
        isDangerous: false,
        color:       "green",
      };
      responseData.message = "✅ Safe alternative route found!";
    } else if (!safeRoute && originalIsDangerous) {
      responseData.safeRoute = null;
      responseData.message   = "⚠️ Warning: No safe alternative route available. Original route passes through danger zone.";
    } else {
      responseData.safeRoute = {
        path:        originalRouteCoords.map((coord) => ({ lat: coord[1], lon: coord[0] })),
        distance:    originalRoute.distance,
        duration:    originalRoute.duration,
        isDangerous: false,
        color:       "green",
      };
      responseData.message = "✅ Original route is safe!";
    }

    res.json(responseData);

  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({
      error:   "Error fetching route",
      details: err.response?.data || err.message,
    });
  }
};

export { getSafeRoute };
