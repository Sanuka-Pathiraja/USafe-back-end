require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const safeRouteRouter = require("./Router/safeRouteRouter");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use("/", safeRouteRouter);

app.listen(PORT, () => {
  console.log(`🚀 USafe backend running on port ${PORT}`);
});