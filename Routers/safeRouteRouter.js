import express from "express";
const router = express.Router();

import { getSafeRoute } from "../Controller/safeRouteController.js";

router.get("/safe-route", getSafeRoute);

export default router;


// this is the expected body to get the route
// {
//   "startLat": 6.8391,
//   "startLon": 79.8817,
//   "endLat": 6.8425,
//   "endLon": 79.8846,
//   "redZones": [
//     {
//       "lat": 6.8398,
//       "lon": 79.8847,
//       "radius": 50
//     }
//   ]
// }