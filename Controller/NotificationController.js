import AppDataSource from "../config/data-source.js";
import { NOTIFICATION_PLATFORM } from "../Model/NotificationDeviceToken.js";

const VALID_PLATFORMS = new Set(Object.values(NOTIFICATION_PLATFORM));

function normalizeToken(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizePlatform(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeDeviceName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 255) : null;
}

export const registerDeviceToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const token = normalizeToken(req.body?.token);
    const platform = normalizePlatform(req.body?.platform);
    const deviceName = normalizeDeviceName(req.body?.deviceName);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Device token is required.",
      });
    }

    if (!VALID_PLATFORMS.has(platform)) {
      return res.status(400).json({
        success: false,
        message: "Platform must be one of android, ios, or web.",
      });
    }

    const userRepo = AppDataSource.getRepository("User");
    const tokenRepo = AppDataSource.getRepository("NotificationDeviceToken");

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    let deviceToken = await tokenRepo.findOneBy({ token });
    if (!deviceToken) {
      deviceToken = tokenRepo.create({
        userId,
        token,
        platform,
        deviceName,
        isActive: true,
        lastUsedAt: new Date(),
      });
    } else {
      deviceToken.userId = userId;
      deviceToken.platform = platform;
      deviceToken.deviceName = deviceName;
      deviceToken.isActive = true;
      deviceToken.lastUsedAt = new Date();
    }

    await tokenRepo.save(deviceToken);

    return res.status(200).json({
      success: true,
      message: "Device token registered successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to register device token.",
    });
  }
};

export const removeDeviceToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const token = normalizeToken(req.body?.token);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Device token is required.",
      });
    }

    const tokenRepo = AppDataSource.getRepository("NotificationDeviceToken");
    const deviceToken = await tokenRepo.findOneBy({ token, userId });

    if (!deviceToken) {
      return res.status(404).json({
        success: false,
        message: "Device token not found.",
      });
    }

    await tokenRepo.remove(deviceToken);

    return res.status(200).json({
      success: true,
      message: "Device token removed successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to remove device token.",
    });
  }
};
