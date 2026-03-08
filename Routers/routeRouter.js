const express = require("express");
const router = express.Router();
const { getSafeRoute } = require("../Controller/routeController");
router.post("/safe-route", getSafeRoute);