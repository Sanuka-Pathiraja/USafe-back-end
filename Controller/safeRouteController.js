const axios = require("axios");
const circleToPolygon = require("../utils/circlePolygon");
const routeIntersectsZones = require("../utils/zoneChecker");

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
      } });
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
      if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
        console.log(`✅ Route ${i + 1} is SAFE!`);
        safeRoute = route.geometry.coordinates;
        safeRouteData = route;
        break;
      } else {
        console.log(`❌ Route ${i + 1} passes through danger zone`);
      }
    }
    
  
}
catch (error) {
    console.error("Error fetching route:", error);
    res.status(500).json({ error: "Failed to fetch route" });
  } };
