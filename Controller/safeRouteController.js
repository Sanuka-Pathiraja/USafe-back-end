const axios = require("axios");
const { routeIntersectsZones } = require("../utils/distance");
const { getRoutesFromMapbox } = require("../NaviFeat/mapboxService");
const getSafeRoute = async (req, res) => {
    try {
      const { start, end, redZones } = req.body;
  
      const routes = await getRoutesFromMapbox(start, end);
  
      for (let route of routes) {
        const intersects = routeIntersectsZones(route.geometry.coordinates, redZones);
  
        if (!intersects) {
          return res.json({
            status: "success",
            message: "Safe route found",
            route
          });
        }
      }
  
      res.json({
        status: "warning",
        message: "No completely safe route found"
      });
  
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  module.exports = { getSafeRoute };