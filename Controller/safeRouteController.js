import axios from "axios";
import { circlePolygon } from "../utils/circlePolygon.js";
import { routeIntersectsZones } from "../utils/zoneChecker.js";

function parseCoordinate(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function normalizePoint(raw, latKey = "lat", lonKey = "lon") {
  if (!raw || typeof raw !== "object") return null;

  const lat = parseCoordinate(raw[latKey], -90, 90);
  const lon = parseCoordinate(raw[lonKey], -180, 180);
  if (lat === null || lon === null) return null;

  return { lat, lon };
}

function normalizeZone(zone) {
  if (!zone || typeof zone !== "object") return null;

  const lat = parseCoordinate(zone.lat, -90, 90);
  const lon = parseCoordinate(zone.lon, -180, 180);
  const radius = Number(zone.radius);

  if (lat === null || lon === null || !Number.isFinite(radius) || radius <= 0) {
    return null;
  }

  return { lat, lon, radius };
}

function resolveRequestData(req) {
  const source = req.method === "GET" ? req.query : req.body || {};

  const start = normalizePoint({
    lat: source.startLat ?? source.originLat ?? source.lat1,
    lon: source.startLon ?? source.startLng ?? source.originLng ?? source.lon1 ?? source.lng1,
  });

  const end = normalizePoint({
    lat: source.endLat ?? source.destinationLat ?? source.lat2,
    lon: source.endLon ?? source.endLng ?? source.destinationLng ?? source.lon2 ?? source.lng2,
  });

  const redZones = Array.isArray(source.redZones) ? source.redZones.map(normalizeZone).filter(Boolean) : [];

  return { start, end, redZones };
}

async function fetchRoutes(start, end, extraParams = {}) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lon},${start.lat};${end.lon},${end.lat}`;

  const response = await axios.get(url, {
    params: {
      geometries: "geojson",
      access_token: process.env.MAPBOX_TOKEN,
      alternatives: true,
      overview: "full",
      ...extraParams,
    },
  });

  return response.data?.routes || [];
}

const getSafeRoute = async (req, res) => {
  try {
    if (!process.env.MAPBOX_TOKEN) {
      return res.status(500).json({
        success: false,
        message: "MAPBOX_TOKEN is not configured",
      });
    }

    const { start, end, redZones } = resolveRequestData(req);

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: "startLat/startLon and endLat/endLon are required and must be valid coordinates",
      });
    }

    if (redZones.length === 0) {
      return res.status(400).json({
        success: false,
        message: "redZones must contain at least one valid zone with lat, lon, and radius",
      });
    }

    const routes = await fetchRoutes(start, end);
    if (routes.length === 0) {
      return res.status(404).json({ success: false, error: "No routes found" });
    }

    const originalRoute = routes[0];
    const originalRouteCoords = originalRoute.geometry.coordinates;
    const originalIsDangerous = routeIntersectsZones(originalRouteCoords, redZones);

    let safeRouteData = null;
    for (const route of routes) {
      if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
        safeRouteData = route;
        break;
      }
    }

    if (!safeRouteData && originalIsDangerous) {
      const alternativeRoutes = await fetchRoutes(start, end, { exclude: "toll" });
      for (const route of alternativeRoutes) {
        if (!routeIntersectsZones(route.geometry.coordinates, redZones)) {
          safeRouteData = route;
          break;
        }
      }
    }

    const responseData = {
      success: true,
      start,
      end,
      redZones: redZones.map((zone) => ({
        center: { lat: zone.lat, lon: zone.lon },
        radius: zone.radius,
        polygon: circlePolygon(zone.lon, zone.lat, zone.radius, 32).map((coord) => ({ lat: coord[1], lon: coord[0] })),
      })),
      originalRoute: {
        path: originalRouteCoords.map((coord) => ({ lat: coord[1], lon: coord[0] })),
        distance: originalRoute.distance,
        duration: originalRoute.duration,
        isDangerous: originalIsDangerous,
        color: originalIsDangerous ? "red" : "blue",
      },
      totalRoutesChecked: routes.length,
    };

    if (safeRouteData && originalIsDangerous) {
      responseData.safeRoute = {
        path: safeRouteData.geometry.coordinates.map((coord) => ({ lat: coord[1], lon: coord[0] })),
        distance: safeRouteData.distance,
        duration: safeRouteData.duration,
        isDangerous: false,
        color: "blue",
      };
      responseData.message = "Safe alternative route found";
    } else if (!safeRouteData && originalIsDangerous) {
      responseData.safeRoute = null;
      responseData.message = "No safe alternative route available. Original route passes through danger zone.";
    } else {
      responseData.safeRoute = null;
      responseData.message = "Original route is safe";
    }

    return res.json(responseData);
  } catch (err) {
    console.error("SAFE_ROUTE_ERROR", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      error: "Error fetching route",
      details: err.response?.data || err.message,
    });
  }
};

export { getSafeRoute };
