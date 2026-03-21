import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkNotifyBalance } from "../../CallFeat/notifylkStatus.js";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTIFY_USER_ID = "test-user";
  process.env.NOTIFY_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.NOTIFY_USER_ID;
  delete process.env.NOTIFY_API_KEY;
});

describe("checkNotifyBalance", () => {
  it("throws when NOTIFY_USER_ID is missing", async () => {
    delete process.env.NOTIFY_USER_ID;
    await expect(checkNotifyBalance()).rejects.toThrow("Missing Notify.lk env vars");
  });

  it("throws when NOTIFY_API_KEY is missing", async () => {
    delete process.env.NOTIFY_API_KEY;
    await expect(checkNotifyBalance()).rejects.toThrow("Missing Notify.lk env vars");
  });

  it("returns balance data when Notify.lk responds with success", async () => {
    const mockData = { status: "success", data: { active: true, acc_balance: 3500.0 } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    const result = await checkNotifyBalance();
    expect(result).toEqual({ active: true, acc_balance: 3500.0 });
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("throws when the HTTP response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ message: "Unauthorized" }),
    });

    await expect(checkNotifyBalance()).rejects.toThrow("Notify.lk HTTP 401");
  });

  it("throws when response status field is not 'success'", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: "error", message: "Invalid credentials" }),
    });

    await expect(checkNotifyBalance()).rejects.toThrow("Notify.lk status failed");
  });

  it("includes user_id and api_key in the request URL", async () => {
    const mockData = { status: "success", data: { active: true, acc_balance: 100 } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    await checkNotifyBalance();

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("user_id=test-user");
    expect(calledUrl).toContain("api_key=test-key");
  });
});
