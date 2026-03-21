import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

// Prevent importing the real TypeORM entity which might fail in test env
vi.mock("../../Model/NotificationDeviceToken.js", () => ({
  NOTIFICATION_PLATFORM: { ANDROID: "android", IOS: "ios", WEB: "web" },
  default: {},
}));

import AppDataSource from "../../config/data-source.js";
import { registerDeviceToken, removeDeviceToken } from "../../Controller/NotificationController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeRepo(overrides = {}) {
  return {
    findOneBy: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockReturnValue({}),
    save: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ─── registerDeviceToken ──────────────────────────────────────────────────────

describe("registerDeviceToken", () => {
  it("returns 400 when token is missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, body: { platform: "android" } };
    const res = makeRes();
    await registerDeviceToken(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Device token is required." })
    );
  });

  it("returns 400 when platform is invalid", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, body: { token: "fcm-token", platform: "windows" } };
    const res = makeRes();
    await registerDeviceToken(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("android, ios, or web") })
    );
  });

  it("returns 404 when user is not found", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    const tokenRepo = makeRepo();
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : tokenRepo
    );
    const req = { user: { id: 99 }, body: { token: "fcm-token", platform: "android" } };
    const res = makeRes();
    await registerDeviceToken(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("creates a new token and returns 200 when token does not exist yet", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ id: 1 }) });
    const tokenRepo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(null), // token not found → will create new
    });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : tokenRepo
    );
    const req = { user: { id: 1 }, body: { token: "fcm-token", platform: "android", deviceName: "Pixel 7" } };
    const res = makeRes();
    await registerDeviceToken(req, res);
    expect(tokenRepo.create).toHaveBeenCalled();
    expect(tokenRepo.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("updates an existing token and returns 200", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ id: 1 }) });
    const existingToken = { id: 5, token: "fcm-token", userId: 99, platform: "ios" };
    const tokenRepo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(existingToken), // token already exists
    });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : tokenRepo
    );
    const req = { user: { id: 1 }, body: { token: "fcm-token", platform: "android" } };
    const res = makeRes();
    await registerDeviceToken(req, res);
    expect(tokenRepo.create).not.toHaveBeenCalled();
    expect(tokenRepo.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── removeDeviceToken ────────────────────────────────────────────────────────

describe("removeDeviceToken", () => {
  it("returns 400 when token is missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, body: {} };
    const res = makeRes();
    await removeDeviceToken(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Device token is required." })
    );
  });

  it("returns 404 when token is not found for this user", async () => {
    const repo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, body: { token: "nonexistent-token" } };
    const res = makeRes();
    await removeDeviceToken(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("removes the token and returns 200 on success", async () => {
    const deviceToken = { id: 5, token: "fcm-token", userId: 1 };
    const repo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(deviceToken) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, body: { token: "fcm-token" } };
    const res = makeRes();
    await removeDeviceToken(req, res);
    expect(repo.remove).toHaveBeenCalledWith(deviceToken);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
