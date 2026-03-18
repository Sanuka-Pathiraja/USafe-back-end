function circleToPolygon(centerLon, centerLat, radiusMeters, numPoints = 32) {

    const coords = [];
    const earthRadius = 6378137;
  
    for (let i = 0; i < numPoints; i++) {

        const angle = (i / numPoints) * 2 * Math.PI;
        const dx = radiusMeters * Math.cos(angle);
        const dy = radiusMeters * Math.sin(angle);

        const dLon = dx / (earthRadius * Math.cos(centerLat * Math.PI / 180));
        const dLat = dy / earthRadius;
    
        coords.push([
        centerLon + dLon * 180 / Math.PI,
        centerLat + dLat * 180 / Math.PI
        ]);

        coords.push(coords[0]);

        return coords;
    
  }
}
module.exports = { circleToPolygon };

