import { MoreThan } from "typeorm";
import AppDataSource from "../config/data-source.js";
import { sendFcmMessage, isFirebaseConfigured, isTokenInvalid } from "./firebaseMessagingService.js";

const LOW_SAFETY_NOTIFICATION_TYPE = "low_safety_score";
const LOW_SAFETY_THRESHOLD = 40;
const DEFAULT_COOLDOWN_MINUTES = 20;
const TITLE = "Safety Score Is Low";
const BODY = "Your safety score dropped below 40. Activate Emergency now.";

function getCooldownMinutes() {
  const raw = Number(process.env.LOW_SAFETY_NOTIFICATION_COOLDOWN_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COOLDOWN_MINUTES;
}

function getCutoffDate() {
  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() - getCooldownMinutes());
  return cutoff;
}

async function writePushLog(payload) {
  try {
    const repo = AppDataSource.getRepository("PushNotificationLog");
    const entry = repo.create(payload);
    await repo.save(entry);
  } catch (error) {
    console.error("Failed to persist push notification log:", error.message);
  }
}

async function disableToken(id) {
  const repo = AppDataSource.getRepository("NotificationDeviceToken");
  await repo.update({ id }, { isActive: false, lastUsedAt: new Date() });
}

async function hasRecentLowSafetyNotification(userId) {
  const repo = AppDataSource.getRepository("PushNotificationLog");
  const existing = await repo.findOne({
    where: {
      userId,
      notificationType: LOW_SAFETY_NOTIFICATION_TYPE,
      status: "sent",
      sentAt: MoreThan(getCutoffDate()),
    },
    order: {
      sentAt: "DESC",
    },
  });

  return Boolean(existing);
}

function buildLowSafetyMessage({ token, score }) {
  return {
    token,
    notification: {
      title: TITLE,
      body: BODY,
    },
    data: {
      type: LOW_SAFETY_NOTIFICATION_TYPE,
      score: String(score),
      threshold: String(LOW_SAFETY_THRESHOLD),
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    android: {
      priority: "high",
      notification: {
        channel_id: "usafe_emergency_alerts",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  };
}

export async function triggerLowSafetyScoreNotification({ userId, score }) {
  if (!userId || !Number.isFinite(Number(score))) {
    return { triggered: false, reason: "invalid_input" };
  }

  const numericScore = Math.round(Number(score));
  if (numericScore >= LOW_SAFETY_THRESHOLD) {
    return { triggered: false, reason: "threshold_not_met" };
  }

  const tokenRepo = AppDataSource.getRepository("NotificationDeviceToken");
  const activeTokens = await tokenRepo.find({
    where: {
      userId,
      isActive: true,
    },
    order: {
      updatedAt: "DESC",
    },
  });

  if (activeTokens.length === 0) {
    return { triggered: false, reason: "no_active_tokens" };
  }

  if (await hasRecentLowSafetyNotification(userId)) {
    return { triggered: false, reason: "cooldown_active" };
  }

  if (!isFirebaseConfigured()) {
    await writePushLog({
      userId,
      token: null,
      platform: null,
      notificationType: LOW_SAFETY_NOTIFICATION_TYPE,
      score: numericScore,
      threshold: LOW_SAFETY_THRESHOLD,
      provider: "fcm",
      providerResponse: { code: "FCM_NOT_CONFIGURED" },
      status: "skipped",
      sentAt: new Date(),
    });

    return { triggered: false, reason: "fcm_not_configured" };
  }

  let sentCount = 0;

  for (const device of activeTokens) {
    try {
      const result = await sendFcmMessage(buildLowSafetyMessage({ token: device.token, score: numericScore }));
      sentCount += 1;

      await tokenRepo.update({ id: device.id }, { lastUsedAt: new Date(), isActive: true });
      await writePushLog({
        userId,
        token: device.token,
        platform: device.platform,
        notificationType: LOW_SAFETY_NOTIFICATION_TYPE,
        score: numericScore,
        threshold: LOW_SAFETY_THRESHOLD,
        provider: result.provider || "fcm",
        providerResponse: result.providerResponse || null,
        status: "sent",
        sentAt: new Date(),
      });
    } catch (error) {
      const providerResponse = error?.payload || {
        message: error?.message || "FCM send failed",
        fcmErrorCode: error?.fcmErrorCode || null,
      };

      if (isTokenInvalid(providerResponse)) {
        await disableToken(device.id);
      }

      await writePushLog({
        userId,
        token: device.token,
        platform: device.platform,
        notificationType: LOW_SAFETY_NOTIFICATION_TYPE,
        score: numericScore,
        threshold: LOW_SAFETY_THRESHOLD,
        provider: "fcm",
        providerResponse,
        status: isTokenInvalid(providerResponse) ? "invalid_token" : "failed",
        sentAt: new Date(),
      });
    }
  }

  return {
    triggered: sentCount > 0,
    sentCount,
    totalTokens: activeTokens.length,
    reason: sentCount > 0 ? "sent" : "all_failed",
  };
}

export { LOW_SAFETY_NOTIFICATION_TYPE, LOW_SAFETY_THRESHOLD };
