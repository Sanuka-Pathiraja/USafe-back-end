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
    
  
}
catch (error) {
    console.error("Error fetching route:", error);
    res.status(500).json({ error: "Failed to fetch route" });
  } };
