const axios = require("axios");

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

const getRoutesFromMapbox = async (start, end) => {

  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${start.lon},${start.lat};${end.lon},${end.lat}?alternatives=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`;
};