import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

// Mock the Firebase service so no real network calls are made
const { mockIsFirebaseConfigured, mockSendFcmMessage, mockIsTokenInvalid } = vi.hoisted(() => ({
  mockIsFirebaseConfigured: vi.fn(),
  mockSendFcmMessage: vi.fn(),
  mockIsTokenInvalid: vi.fn(),
}));

vi.mock("../../services/firebaseMessagingService.js", () => ({
  isFirebaseConfigured: mockIsFirebaseConfigured,
  sendFcmMessage: mockSendFcmMessage,
  isTokenInvalid: mockIsTokenInvalid,
}));

import AppDataSource from "../../config/data-source.js";
import { triggerLowSafetyScoreNotification } from "../../services/lowSafetyNotificationService.js";

function makeRepo(overrides = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockReturnValue({}),
    save: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeTokens(n = 1) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    token: `device-token-${i + 1}`,
    platform: "android",
    isActive: true,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsFirebaseConfigured.mockReturnValue(true);
  mockSendFcmMessage.mockResolvedValue({ success: true, provider: "fcm", providerResponse: {} });
  mockIsTokenInvalid.mockReturnValue(false);
});

describe("triggerLowSafetyScoreNotification", () => {
  it("returns invalid_input when userId is missing", async () => {
    const result = await triggerLowSafetyScoreNotification({ userId: null, score: 30 });
    expect(result).toMatchObject({ triggered: false, reason: "invalid_input" });
  });

  it("returns invalid_input when score is not a number", async () => {
    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: "abc" });
    expect(result).toMatchObject({ triggered: false, reason: "invalid_input" });
  });

  it("returns threshold_not_met when score is >= 40", async () => {
    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: 40 });
    expect(result).toMatchObject({ triggered: false, reason: "threshold_not_met" });
  });

  it("returns threshold_not_met when score is above 40", async () => {
    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: 75 });
    expect(result).toMatchObject({ triggered: false, reason: "threshold_not_met" });
  });

  it("returns no_active_tokens when there are no active device tokens", async () => {
    const tokenRepo = makeRepo({ find: vi.fn().mockResolvedValue([]) });
    AppDataSource.getRepository.mockReturnValue(tokenRepo);

    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: 25 });
    expect(result).toMatchObject({ triggered: false, reason: "no_active_tokens" });
  });

  it("returns cooldown_active when a recent notification was already sent", async () => {
    const tokenRepo = makeRepo({ find: vi.fn().mockResolvedValue(makeTokens(1)) });
    const logRepo = makeRepo({
      find: vi.fn().mockResolvedValue(makeTokens(1)),
      findOne: vi.fn().mockResolvedValue({ id: 1 }), // existing recent log entry
    });
    // getRepository is called multiple times:
    // 1st: NotificationDeviceToken (tokens), 2nd: PushNotificationLog (cooldown check)
    AppDataSource.getRepository
      .mockReturnValueOnce(tokenRepo)   // tokens
      .mockReturnValueOnce(logRepo);    // cooldown check

    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: 25 });
    expect(result).toMatchObject({ triggered: false, reason: "cooldown_active" });
  });

  it("returns fcm_not_configured and writes a skipped log when Firebase is not configured", async () => {
    mockIsFirebaseConfigured.mockReturnValue(false);

    const tokenRepo = makeRepo({ find: vi.fn().mockResolvedValue(makeTokens(1)) });
    const logRepo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) }); // no cooldown
    // 3rd repo call is for PushNotificationLog save
    const saveRepo = makeRepo();

    AppDataSource.getRepository
      .mockReturnValueOnce(tokenRepo)  // tokens
      .mockReturnValueOnce(logRepo)    // cooldown check
      .mockReturnValueOnce(saveRepo);  // writePushLog

    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: 20 });
    expect(result).toMatchObject({ triggered: false, reason: "fcm_not_configured" });
  });

  it("returns triggered:true and sentCount:1 when FCM send succeeds", async () => {
    const tokens = makeTokens(1);
    const tokenRepo = makeRepo({ find: vi.fn().mockResolvedValue(tokens) });
    const logRepo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) }); // no cooldown
    const logSaveRepo = makeRepo();

    // getRepository call order in success path:
    // 1. "NotificationDeviceToken" → find tokens
    // 2. "PushNotificationLog"     → cooldown check (findOne)
    // 3. "PushNotificationLog"     → writePushLog (create + save)
    // Note: tokenRepo.update in the success path reuses the top-level tokenRepo —
    //       it does NOT trigger a new getRepository call.
    AppDataSource.getRepository
      .mockReturnValueOnce(tokenRepo)   // tokens
      .mockReturnValueOnce(logRepo)     // cooldown check
      .mockReturnValueOnce(logSaveRepo); // writePushLog

    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: 10 });
    expect(result).toMatchObject({ triggered: true, sentCount: 1, totalTokens: 1 });
    expect(mockSendFcmMessage).toHaveBeenCalledOnce();
  });

  it("disables invalid token and logs status:invalid_token when FCM rejects it", async () => {
    const tokens = makeTokens(1);
    const tokenRepo = makeRepo({
      find: vi.fn().mockResolvedValue(tokens),
      update: vi.fn().mockResolvedValue({}),
    });
    const logRepo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const logSaveRepo = makeRepo();

    const fcmError = new Error("UNREGISTERED");
    fcmError.fcmErrorCode = "UNREGISTERED";
    fcmError.payload = {
      error: {
        details: [
          { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" },
        ],
      },
    };

    mockSendFcmMessage.mockRejectedValue(fcmError);
    mockIsTokenInvalid.mockReturnValue(true);

    AppDataSource.getRepository
      .mockReturnValueOnce(tokenRepo)   // tokens
      .mockReturnValueOnce(logRepo)     // cooldown check
      .mockReturnValueOnce(tokenRepo)   // disableToken → update
      .mockReturnValueOnce(logSaveRepo); // writePushLog

    const result = await triggerLowSafetyScoreNotification({ userId: 1, score: 15 });
    // No tokens were sent successfully
    expect(result).toMatchObject({ triggered: false, reason: "all_failed" });
    // Token should have been disabled
    expect(tokenRepo.update).toHaveBeenCalledWith(
      { id: tokens[0].id },
      expect.objectContaining({ isActive: false })
    );
  });
});
