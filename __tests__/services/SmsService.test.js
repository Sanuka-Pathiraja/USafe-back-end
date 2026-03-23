import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../CallFeat/notifylksms.js", () => ({
  sendNotifySMS: vi.fn(),
}));

import { sendNotifySMS } from "../../CallFeat/notifylksms.js";
import {
  buildStartMessage,
  buildSafeMessage,
  buildEmergencyMessage,
  sendSms,
} from "../../services/SmsService.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildStartMessage", () => {
  it("includes contact name, user name, trip name, and duration", () => {
    const msg = buildStartMessage({
      contactName: "Alice",
      userName: "Bob",
      tripName: "Night Walk",
      durationMinutes: 30,
    });
    expect(msg).toContain("Alice");
    expect(msg).toContain("Bob");
    expect(msg).toContain("Night Walk");
    expect(msg).toContain("30");
  });

  it("returns a non-empty string", () => {
    const msg = buildStartMessage({ contactName: "A", userName: "B", tripName: "T", durationMinutes: 5 });
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe("buildSafeMessage", () => {
  it("includes the user name and trip name", () => {
    const msg = buildSafeMessage({ userName: "Bob", tripName: "Night Walk" });
    expect(msg).toContain("Bob");
    expect(msg).toContain("Night Walk");
  });
});

describe("buildEmergencyMessage", () => {
  it("includes user name, trip name, and the maps link", () => {
    const msg = buildEmergencyMessage({
      userName: "Bob",
      tripName: "Night Walk",
      mapsLink: "https://maps.google.com/?q=6.9271,79.8612",
    });
    expect(msg).toContain("Bob");
    expect(msg).toContain("Night Walk");
    expect(msg).toContain("https://maps.google.com/?q=6.9271,79.8612");
  });
});

describe("sendSms", () => {
  it("calls sendNotifySMS with the correct to, message, and unicode:false for ASCII text", async () => {
    sendNotifySMS.mockResolvedValue({ status: "sent" });

    await sendSms({ to: "94712345678", body: "Hello" });

    expect(sendNotifySMS).toHaveBeenCalledWith({
      to: "94712345678",
      message: "Hello",
      unicode: false,
    });
  });

  it("sets unicode:true for messages containing non-ASCII characters", async () => {
    sendNotifySMS.mockResolvedValue({ status: "sent" });

    await sendSms({ to: "94712345678", body: "ආයුබෝවන්" });

    expect(sendNotifySMS).toHaveBeenCalledWith(
      expect.objectContaining({ unicode: true })
    );
  });

  it("returns the result from sendNotifySMS", async () => {
    sendNotifySMS.mockResolvedValue({ data: { message_id: "abc123" } });

    const result = await sendSms({ to: "94712345678", body: "Test" });

    expect(result).toEqual({ data: { message_id: "abc123" } });
  });
});
