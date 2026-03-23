import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

// Prevent real SMS from being sent
vi.mock("../../services/SmsService.js", () => ({
  sendSms: vi.fn().mockResolvedValue({ status: "sent" }),
  buildStartMessage: vi.fn(),
  buildSafeMessage: vi.fn(),
  buildEmergencyMessage: vi.fn(),
}));

import AppDataSource from "../../config/data-source.js";
import { sendSms } from "../../services/SmsService.js";
import { startTrip, updateLocation, addTime, endTripSafe, triggerSOS } from "../../Controller/TripController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeRepo(overrides = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    findOneBy: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockReturnValue({}),
    save: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    exist: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers(); // prevent auto-SOS setTimeout from firing during tests
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── startTrip ────────────────────────────────────────────────────────────────

describe("startTrip", () => {
  it("returns 400 when tripName is missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, body: { durationMinutes: 30, contactIds: [1] } };
    const res = makeRes();
    await startTrip(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "tripName is required" }));
  });

  it("returns 400 when durationMinutes is not a positive integer", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, body: { tripName: "Walk", durationMinutes: -5, contactIds: [1] } };
    const res = makeRes();
    await startTrip(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when contactIds is empty", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, body: { tripName: "Walk", durationMinutes: 30, contactIds: [] } };
    const res = makeRes();
    await startTrip(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("contactIds") })
    );
  });

  it("returns 400 when contactId does not belong to the user", async () => {
    const tripRepo = makeRepo({ exist: vi.fn().mockResolvedValue(false) });
    const contactRepo = makeRepo({ find: vi.fn().mockResolvedValue([]) }); // user owns 0 of the requested IDs
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "TripSession" ? tripRepo : contactRepo
    );
    const req = { user: { id: 1 }, body: { tripName: "Walk", durationMinutes: 30, contactIds: [999] } };
    const res = makeRes();
    await startTrip(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("invalid") })
    );
  });

  it("creates a trip session, sends SMS notifications, and returns 201 on success", async () => {
    const savedTrip = {
      id: "trip-uuid",
      tripName: "Night Walk",
      status: "ACTIVE",
      expectedEndTime: new Date(Date.now() + 30 * 60 * 1000),
      trackingId: "abc123",
      contactIds: [1],
    };
    const tripRepo = makeRepo({
      exist: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockReturnValue(savedTrip),
      save: vi.fn().mockResolvedValue(savedTrip),
    });
    const contactRepo = makeRepo({
      find: vi.fn().mockResolvedValue([{ contactId: 1, phone: "0711111111" }]),
    });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "TripSession" ? tripRepo : contactRepo
    );

    const req = { user: { id: 1 }, body: { tripName: "Night Walk", durationMinutes: 30, contactIds: [1] } };
    const res = makeRes();
    await startTrip(req, res);

    expect(sendSms).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── updateLocation ───────────────────────────────────────────────────────────

describe("updateLocation", () => {
  it("returns 400 when tripId is missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, params: {}, body: { lat: 6.9271, lng: 79.8612 } };
    const res = makeRes();
    await updateLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when coordinates are invalid", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: { lat: "bad", lng: 79.8612 } };
    const res = makeRes();
    await updateLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when trip is not found", async () => {
    const repo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: { lat: 6.9271, lng: 79.8612 } };
    const res = makeRes();
    await updateLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 409 when trip is not ACTIVE", async () => {
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue({ id: "trip-uuid", userId: 1, status: "SAFE" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: { lat: 6.9271, lng: 79.8612 } };
    const res = makeRes();
    await updateLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("updates location and returns 200 on success", async () => {
    const trip = { id: "trip-uuid", userId: 1, status: "ACTIVE" };
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(trip),
      save: vi.fn().mockResolvedValue({ ...trip, lastKnownLat: 6.9271, lastKnownLng: 79.8612 }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: { lat: 6.9271, lng: 79.8612 } };
    const res = makeRes();
    await updateLocation(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── addTime ──────────────────────────────────────────────────────────────────

describe("addTime", () => {
  it("returns 400 when extraMinutes is missing or invalid", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: {} };
    const res = makeRes();
    await addTime(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 409 when trip is not ACTIVE", async () => {
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue({ id: "trip-uuid", userId: 1, status: "SOS" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: { extraMinutes: 15 } };
    const res = makeRes();
    await addTime(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("extends the trip time and returns 200 on success", async () => {
    const trip = {
      id: "trip-uuid",
      userId: 1,
      status: "ACTIVE",
      expectedEndTime: new Date(Date.now() + 30 * 60 * 1000),
    };
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(trip),
      save: vi.fn().mockResolvedValue({ ...trip, expectedEndTime: new Date(Date.now() + 45 * 60 * 1000) }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: { extraMinutes: 15 } };
    const res = makeRes();
    await addTime(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── endTripSafe ──────────────────────────────────────────────────────────────

describe("endTripSafe", () => {
  it("returns 400 when tripId is missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, params: {}, body: {} };
    const res = makeRes();
    await endTripSafe(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 409 when trip is not ACTIVE", async () => {
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue({ id: "trip-uuid", userId: 1, status: "SOS" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: {} };
    const res = makeRes();
    await endTripSafe(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("marks trip SAFE and returns 200", async () => {
    const trip = { id: "trip-uuid", userId: 1, status: "ACTIVE" };
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(trip),
      save: vi.fn().mockResolvedValue({ ...trip, status: "SAFE" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: {} };
    const res = makeRes();
    await endTripSafe(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── triggerSOS ───────────────────────────────────────────────────────────────

describe("triggerSOS", () => {
  it("returns 400 when tripId is missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = { user: { id: 1 }, params: {}, body: {} };
    const res = makeRes();
    await triggerSOS(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 409 when SOS is already triggered", async () => {
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue({ id: "trip-uuid", userId: 1, status: "SOS" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: {} };
    const res = makeRes();
    await triggerSOS(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "SOS already triggered for this trip" })
    );
  });

  it("triggers SOS and returns 200 on success", async () => {
    const trip = { id: "trip-uuid", userId: 1, status: "ACTIVE", contactIds: [1, 2] };
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(trip),
      save: vi.fn().mockResolvedValue({ ...trip, status: "SOS" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = { user: { id: 1 }, params: { tripId: "trip-uuid" }, body: {} };
    const res = makeRes();
    await triggerSOS(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
