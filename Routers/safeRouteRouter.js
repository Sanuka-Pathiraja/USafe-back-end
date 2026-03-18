const express = require("express");
const router = express.Router();

const { getSafeRoute } = require("../Controller/safeRouteController");

router.get("/safe-route", getSafeRoute);

module.exports = router;