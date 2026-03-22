import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock google-auth-library so no real JWT signing happens
const { mockAuthorize } = vi.hoisted(() => ({
  mockAuthorize: vi.fn().mockResolvedValue({ access_token: "fake-access-token" }),
}));

vi.mock("google-auth-library", () => {
  function JWT(opts) {
    this.email = opts.email;
    this.key = opts.key;
    this.scopes = opts.scopes;
    this.authorize = mockAuthorize;
  }
  return { JWT };
});

import { isFirebaseConfigured, isTokenInvalid, sendFcmMessage } from "../../services/firebaseMessagingService.js";

// Save real env values and restore after each test
const FIREBASE_VARS = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "GOOGLE_CLOUD_PROJECT"];

function setFirebaseEnv() {
  process.env.FIREBASE_PROJECT_ID = "test-project";
  process.env.FIREBASE_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
  process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\\nfakekey\\n-----END RSA PRIVATE KEY-----";
}

function clearFirebaseEnv() {
  for (const key of FIREBASE_VARS) delete process.env[key];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearFirebaseEnv();
});

afterEach(() => {
  clearFirebaseEnv();
});

// ─── isFirebaseConfigured ──────────────────────────────────────────────────

describe("isFirebaseConfigured", () => {
  it("returns false when no Firebase env vars are set", () => {
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("returns false when only FIREBASE_PROJECT_ID is set", () => {
    process.env.FIREBASE_PROJECT_ID = "my-project";
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("returns true when all three required vars are present", () => {
    setFirebaseEnv();
    expect(isFirebaseConfigured()).toBe(true);
  });

  it("accepts GOOGLE_CLOUD_PROJECT as a fallback for project id", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "fallback-project";
    process.env.FIREBASE_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\\nfakekey\\n-----END RSA PRIVATE KEY-----";
    expect(isFirebaseConfigured()).toBe(true);
  });
});

// ─── isTokenInvalid ────────────────────────────────────────────────────────

describe("isTokenInvalid", () => {
  function makePayload(errorCode) {
    return {
      error: {
        details: [
          {
            "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
            errorCode,
          },
        ],
      },
    };
  }

  it("returns true for UNREGISTERED errorCode", () => {
    expect(isTokenInvalid(makePayload("UNREGISTERED"))).toBe(true);
  });

  it("returns true for INVALID_ARGUMENT errorCode", () => {
    expect(isTokenInvalid(makePayload("INVALID_ARGUMENT"))).toBe(true);
  });

  it("returns false for other error codes like QUOTA_EXCEEDED", () => {
    expect(isTokenInvalid(makePayload("QUOTA_EXCEEDED"))).toBe(false);
  });

  it("returns false when payload has no FCM error details", () => {
    expect(isTokenInvalid({})).toBe(false);
    expect(isTokenInvalid(null)).toBe(false);
    expect(isTokenInvalid(undefined)).toBe(false);
  });
});

// ─── sendFcmMessage ────────────────────────────────────────────────────────

describe("sendFcmMessage", () => {
  it("returns skipped result when Firebase is not configured", async () => {
    // env vars are cleared in beforeEach
    const result = await sendFcmMessage({ token: "tok", notification: { title: "T" } });
    expect(result).toMatchObject({ success: false, skipped: true, code: "FCM_NOT_CONFIGURED" });
  });

  it("returns success:true and providerResponse on a successful 200 fetch", async () => {
    setFirebaseEnv();
    const mockPayload = { name: "projects/test-project/messages/abc123" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockPayload),
    });

    const result = await sendFcmMessage({ token: "device-token", notification: { title: "Test" } });
    expect(result).toMatchObject({ success: true, provider: "fcm", providerResponse: mockPayload });
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("fcm.googleapis.com"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer fake-access-token" }),
      })
    );
  });

  it("throws an error with fcmErrorCode when FCM returns a non-200 response", async () => {
    setFirebaseEnv();
    const errorPayload = {
      error: {
        status: "NOT_FOUND",
        message: "Requested entity was not found.",
        details: [
          {
            "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
            errorCode: "UNREGISTERED",
          },
        ],
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue(errorPayload),
    });

    await expect(sendFcmMessage({ token: "bad-token" })).rejects.toThrow();

    // Error should carry fcmErrorCode for token invalidation checks downstream
    try {
      await sendFcmMessage({ token: "bad-token" });
    } catch (err) {
      expect(err.fcmErrorCode).toBe("UNREGISTERED");
      expect(err.payload).toEqual(errorPayload);
    }
  });
});
