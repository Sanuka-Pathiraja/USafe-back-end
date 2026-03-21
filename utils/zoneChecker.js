import calculateDistance from "./distance.js";

function distanceToSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return calculateDistance(pLat, pLon, aLat, aLon);

  let t = ((pLon - aLon) * dx + (pLat - aLat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestLat = aLat + t * dy;
  const closestLon = aLon + t * dx;

  return calculateDistance(pLat, pLon, closestLat, closestLon);
}

function routeIntersectsZones(routeCoords, redZones) {
  for (let i = 0; i < routeCoords.length; i++) {
    const coord = routeCoords[i];
    const coordLat = coord[1];
    const coordLon = coord[0];

    for (let zone of redZones) {
      if (calculateDistance(coordLat, coordLon, zone.lat, zone.lon) < zone.radius) {
        return true;
      }

      if (i < routeCoords.length - 1) {
        const next = routeCoords[i + 1];
        const segDist = distanceToSegment(
          zone.lat, zone.lon,
          coordLat, coordLon,
          next[1], next[0]
        );
        if (segDist < zone.radius) {
          return true;
        }
      }
    }
  }
  return false;
}

export default routeIntersectsZones;
