import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

vi.mock("../../config/supabase.js", () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "test/path.jpg" }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/test.jpg" } }),
      }),
    },
  },
}));

vi.mock("../../services/lowSafetyNotificationService.js", () => ({
  triggerLowSafetyScoreNotification: vi.fn().mockResolvedValue({ triggered: false }),
}));

import AppDataSource from "../../config/data-source.js";
import { getCommunityFeed } from "../../Controller/CommunityReportController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeReport(overrides = {}) {
  return {
    reportId: 1,
    issueTypes: ["theft"],
    reportDate_time: new Date("2025-01-01T00:00:00Z"),
    // getReportCoordinates() reads report.locationCoordinates (object) or report.location (string)
    locationCoordinates: { lat: 6.9271, lng: 79.8612 },
    user: { id: 99, firstName: "Alice", lastName: "A" },
    likes: [],
    comments: [],
    ...overrides,
  };
}

function makeRepo(overrides = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getCommunityFeed", () => {
  it("returns 400 when lat is provided but not numeric", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = {
      user: { id: 1 },
      query: { lat: "not-a-number", lng: "79.8612" },
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining("lat") })
    );
  });

  it("returns 400 when radiusKm is zero or negative", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = {
      user: { id: 1 },
      query: { lat: "6.9", lng: "79.8", radiusKm: "0" },
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining("radiusKm") })
    );
  });

  it("returns all reports with default pagination when no filters are given", async () => {
    const reports = [makeReport({ reportId: 1 }), makeReport({ reportId: 2 })];
    const repo = makeRepo({ find: vi.fn().mockResolvedValue(reports) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = {
      user: { id: 1 },
      query: {},
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.total).toBe(2);
    expect(payload.page).toBe(1);
    expect(payload.limit).toBe(10);
  });

  it("filters reports by issueType", async () => {
    const reports = [
      makeReport({ reportId: 1, issueTypes: ["theft"] }),
      makeReport({ reportId: 2, issueTypes: ["flood"] }),
    ];
    const repo = makeRepo({ find: vi.fn().mockResolvedValue(reports) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = {
      user: { id: 1 },
      query: { issueType: "theft" },
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.total).toBe(1); // only theft report passes filter
  });

  it("filters reports by proximity when lat/lng/radiusKm are given", async () => {
    // Near Colombo (lat 6.9271, lng 79.8612) and one in Kandy (~90 km away)
    const nearReport = makeReport({ reportId: 1, locationCoordinates: { lat: 6.9271, lng: 79.8612 } });
    const farReport = makeReport({ reportId: 2, locationCoordinates: { lat: 7.2906, lng: 80.6337 } });
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([nearReport, farReport]) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = {
      user: { id: 1 },
      query: { lat: "6.9271", lng: "79.8612", radiusKm: "1" }, // 1 km radius — only near report
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.total).toBe(1);
  });

  it("respects custom page and limit query params", async () => {
    // 15 reports; page=2, limit=5 → returns reports 6-10
    const reports = Array.from({ length: 15 }, (_, i) =>
      makeReport({ reportId: i + 1, reportDate_time: new Date(2025, 0, i + 1) })
    );
    const repo = makeRepo({ find: vi.fn().mockResolvedValue(reports) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = {
      user: { id: 1 },
      query: { page: "2", limit: "5" },
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.page).toBe(2);
    expect(payload.limit).toBe(5);
    expect(payload.total).toBe(15);
    expect(payload.reports).toHaveLength(5);
    expect(payload.hasMore).toBe(true);
  });

  it("caps limit at 50 even when a higher value is requested", async () => {
    const reports = Array.from({ length: 60 }, (_, i) => makeReport({ reportId: i + 1 }));
    const repo = makeRepo({ find: vi.fn().mockResolvedValue(reports) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = {
      user: { id: 1 },
      query: { limit: "100" },
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.limit).toBe(50);
    expect(payload.reports).toHaveLength(50);
  });

  it("returns empty reports array and hasMore:false when there are no reports", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());

    const req = {
      user: { id: 1 },
      query: {},
      get: vi.fn().mockReturnValue("localhost"),
    };
    const res = makeRes();
    await getCommunityFeed(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.total).toBe(0);
    expect(payload.reports).toHaveLength(0);
    expect(payload.hasMore).toBe(false);
  });
});
