import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { registerDeviceToken, removeDeviceToken } from "../Controller/NotificationController.js";

const notificationRouter = express.Router();

notificationRouter.post("/notification/device-token", authMiddleware, registerDeviceToken);
notificationRouter.delete("/notification/device-token", authMiddleware, removeDeviceToken);

export default notificationRouter;
