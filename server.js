import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import safeRouteRouter from "./Routers/safeRouteRouter.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use("/", safeRouteRouter);

app.listen(PORT, () => {
  console.log(`🚀 Safe backend running on port ${PORT}`);
});