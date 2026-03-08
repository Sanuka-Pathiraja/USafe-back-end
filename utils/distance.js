function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;

}
function routeIntersectsZones(routeCoords, redZones) {
    for (let coord of routeCoords) {
        for (let zone of redZones) {
          const distance = calculateDistance(
            coord[1],
            coord[0],
            zone.lat,
            zone.lon
          );
    
          if (distance < zone.radius) {
            return true;
          }
        }
      }
      return false;
    
}
module.exports = { calculateDistance, routeIntersectsZones };