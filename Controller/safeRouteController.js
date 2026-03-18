import "dotenv/config";
import axios from "axios";
import{circlePolygon} from "../utils/circlePolygon.js";
import { routeIntersectsZones } from "../utils/zoneChecker.js";

const getSafeRoute = async (req, res) => {
  try {

    const start = { lat: 6.8391, lon: 79.8817};
    const end = { lat: 6.8425, lon: 79.8846 };

    const redZones = [
      { lat:6.8398, lon:79.8847, radius: 50 },
    ];

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lon},${start.lat};${end.lon},${end.lat}`;
    
    const response = await axios.get(url, {
      params: {
        geometries: 'geojson',
        access_token: process.env.MAPBOX_TOKEN,
        alternatives: true,
        overview: 'full'
      }
    });

    if (!response.data.routes || response.data.routes.length === 0) {
      return res.status(404).json({ error: "No routes found" });
    }

    console.log(`\n📍 Found ${response.data.routes.length} route(s) from Mapbox`);

    const originalRoute = response.data.routes[0];
    const originalRouteCoords = originalRoute.geometry.coordinates;
    const originalIsDangerous = routeIntersectsZones(originalRouteCoords, redZones);

    console.log(`\n🛣️ Original route is ${originalIsDangerous ? 'DANGEROUS ❌' : 'SAFE ✅'}`);

    let safeRoute = null;
    let safeRouteData = null;

    for (let i = 0; i < response.data.routes.length; i++) {
      const route = response.data.routes[i];

      console.log(`\nChecking route ${i + 1}:`);

      if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
        console.log(`✅ Route ${i + 1} is SAFE!`);
        safeRoute = route.geometry.coordinates;
        safeRouteData = route;
        break;
      } else {
        console.log(`❌ Route ${i + 1} passes through danger zone`);
      }
    }

    if (!safeRoute && originalIsDangerous) {

      console.log("\n⚠️ No safe route found in initial alternatives");
      console.log("Attempting to find alternative path...");

      const alternativeResponse = await axios.get(url, {
        params: {
          geometries: 'geojson',
          access_token: process.env.MAPBOX_TOKEN,
          alternatives: true,
          overview: 'full',
          exclude: 'toll'
        }
      });

      for (let route of alternativeResponse.data.routes) {
        if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
          safeRoute = route.geometry.coordinates;
          safeRouteData = route;
          console.log("✅ Found safe alternative route!");
          break;
        }
      }

    }

    const responseData = {
      start: start,
      end: end,
      redZones: redZones.map(zone => ({
        center: { lat: zone.lat, lon: zone.lon },
        radius: zone.radius,
        polygon: circlePolygon(zone.lon, zone.lat, zone.radius, 32)
          .map(coord => ({ lat: coord[1], lon: coord[0] }))
      })),
      originalRoute: {
        path: originalRouteCoords.map(coord => ({ lat: coord[1], lon: coord[0] })),
        distance: originalRoute.distance,
        duration: originalRoute.duration,
        isDangerous: originalIsDangerous,
        color: originalIsDangerous ? 'red' : 'blue'
      },
      totalRoutesChecked: response.data.routes.length
    };

    if (safeRoute && originalIsDangerous) {

      responseData.safeRoute = {
        path: safeRoute.map(coord => ({ lat: coord[1], lon: coord[0] })),
        distance: safeRouteData.distance,
        duration: safeRouteData.duration,
        isDangerous: false,
        color: 'blue'
      };

      responseData.message = "✅ Safe alternative route found!";

    } else if (!safeRoute && originalIsDangerous) {

      responseData.safeRoute = null;
      responseData.message = "⚠️ Warning: No safe alternative route available. Original route passes through danger zone.";

    } else {

      responseData.safeRoute = null;
      responseData.message = "✅ Original route is safe!";

    }

    res.json(responseData);

  } catch (err) {

    console.error("Error:", err.response?.data || err.message);

    res.status(500).json({ 
      error: "Error fetching route",
      details: err.response?.data || err.message
    });

  }
};

export { getSafeRoute };