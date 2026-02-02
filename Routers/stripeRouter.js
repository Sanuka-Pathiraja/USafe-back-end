import express from "express";
import makePayment from "../Controller/stripeController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const stripeRouter = express.Router();

stripeRouter.post("/create", authMiddleware, makePayment);

export default stripeRouter;
