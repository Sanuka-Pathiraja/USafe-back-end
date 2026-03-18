import { calculateDistance } from "./distance.js";

function routeIntersectsZones(routeCoords, redZones) {

  for (let coord of routeCoords) {

    for (let zone of redZones) {

      const distance = calculateDistance(
        coord[1], coord[0],
        zone.lat, zone.lon
      );

      if (distance < zone.radius) {
        return true;
      }

    }
  }

  return false;
}

export { routeIntersectsZones };