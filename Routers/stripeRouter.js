import express from "express";
import makePayment from "../Controller/stripeController.js";
// import { authMiddleware } from "../middleware/authMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { createCheckoutSession } from "../Controller/stripeCheckoutController.js";

const stripeRouter = express.Router();

// stripeRouter.post("/create", authMiddleware, makePayment);
stripeRouter.post("/checkout", authMiddleware, createCheckoutSession);

export default stripeRouter;
