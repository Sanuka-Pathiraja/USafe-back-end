import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

// Mock Supabase storage — no real file uploads
vi.mock("../../config/supabase.js", () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "reports/file.jpg" }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example.com/file.jpg" } }),
      }),
    },
    from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ data: [], error: null }) }),
  },
}));

// Mock push notification service — no real Firebase calls
vi.mock("../../services/lowSafetyNotificationService.js", () => ({
  triggerLowSafetyScoreNotification: vi.fn().mockResolvedValue({ triggered: false, reason: "threshold_not_met" }),
}));

import AppDataSource from "../../config/data-source.js";
import {
  createCommunityReport,
  getMyCommunityReports,
  getCommunityReportDetails,
  getCommunityFeed,
  addCommunityReportLike,
  removeCommunityReportLike,
  getCommunityReportComments,
  createCommunityReportComment,
  deleteCommunityReport,
  getLiveSafetyScore,
} from "../../Controller/CommunityReportController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  // mapReportResponse calls req.get("host") and req.protocol
  return res;
}

function makeReq(overrides = {}) {
  return {
    user: { id: 1 },
    params: {},
    query: {},
    body: {},
    files: undefined,
    protocol: "http",
    get: vi.fn().mockReturnValue("localhost"),
    originalUrl: "/reports",
    ...overrides,
  };
}

function makeRepo(overrides = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    findOneBy: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockReturnValue({}),
    save: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ─── createCommunityReport ────────────────────────────────────────────────────

describe("createCommunityReport", () => {
  it("returns 400 when location coordinates are missing entirely", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ body: { reportContent: "Suspicious activity" } });
    const res = makeRes();
    await createCommunityReport(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("locationCoordinates") })
    );
  });

  it("returns 400 when coordinate input is present but invalid", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ body: { lat: "not-a-number", lng: "also-bad" } });
    const res = makeRes();
    await createCommunityReport(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the user is not found", async () => {
    const reportRepo = makeRepo();
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : reportRepo
    );
    const req = makeReq({ body: { lat: 6.9271, lng: 79.8612, reportContent: "Test" } });
    const res = makeRes();
    await createCommunityReport(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("creates a report and returns 201 on success (no file uploads)", async () => {
    const report = {
      reportId: 1,
      reportContent: "Broken streetlight",
      reportDate_time: new Date().toISOString(),
      images_proofs: [],
      issueTypes: ["infrastructure"],
      location: "Colombo Fort",
      locationCoordinates: { lat: 6.9271, lng: 79.8612 },
    };
    const reportRepo = makeRepo({
      create: vi.fn().mockReturnValue(report),
      save: vi.fn().mockResolvedValue(report),
    });
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ id: 1 }) });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : reportRepo
    );
    const req = makeReq({
      body: {
        lat: 6.9271,
        lng: 79.8612,
        reportContent: "Broken streetlight",
        location: "Colombo Fort",
        issueTypes: ["infrastructure"],
      },
    });
    const res = makeRes();
    await createCommunityReport(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── getMyCommunityReports ────────────────────────────────────────────────────

describe("getMyCommunityReports", () => {
  it("returns an empty list when the user has no reports", async () => {
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([]) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = makeReq();
    const res = makeRes();
    await getMyCommunityReports(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.total).toBe(0);
    expect(payload.reports).toEqual([]);
  });

  it("returns mapped reports for the authenticated user", async () => {
    const report = {
      reportId: 1,
      reportContent: "Test",
      reportDate_time: new Date().toISOString(),
      images_proofs: [],
      issueTypes: [],
      location: "Colombo",
      locationCoordinates: null,
      user: { id: 1 },
    };
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([report]) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = makeReq();
    const res = makeRes();
    await getMyCommunityReports(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.total).toBe(1);
    expect(payload.reports[0].reportId).toBe(1);
  });
});

// ─── getCommunityReportDetails ────────────────────────────────────────────────

describe("getCommunityReportDetails", () => {
  it("returns 400 for a non-numeric reportId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ params: { reportId: "abc" } });
    const res = makeRes();
    await getCommunityReportDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when report is not found", async () => {
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = makeReq({ params: { reportId: "99" } });
    const res = makeRes();
    await getCommunityReportDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns the report on success", async () => {
    const report = {
      reportId: 5,
      reportContent: "Noise complaint",
      reportDate_time: new Date().toISOString(),
      images_proofs: [],
      issueTypes: [],
      location: "Kandy",
      locationCoordinates: null,
      user: { id: 1 },
    };
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(report) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = makeReq({ params: { reportId: "5" } });
    const res = makeRes();
    await getCommunityReportDetails(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, report: expect.objectContaining({ reportId: 5 }) })
    );
  });
});

// ─── addCommunityReportLike ───────────────────────────────────────────────────

describe("addCommunityReportLike", () => {
  it("returns 400 for an invalid reportId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ params: { reportId: "abc" } });
    const res = makeRes();
    await addCommunityReportLike(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the report does not exist", async () => {
    const reportRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ id: 1 }) });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : reportRepo
    );
    const req = makeReq({ params: { reportId: "99" } });
    const res = makeRes();
    await addCommunityReportLike(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("creates a like and returns 200 with like summary", async () => {
    const report = { reportId: 1 };
    const user = { id: 1 };
    const reportRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(report) });
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(user) });
    const likeRepo = makeRepo({
      findOne: vi.fn().mockResolvedValue(null), // no existing like
      create: vi.fn().mockReturnValue({}),
      save: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(1),
    });
    AppDataSource.getRepository.mockImplementation((entity) => {
      if (entity === "User") return userRepo;
      if (entity === "CommunityReportLike") return likeRepo;
      return reportRepo;
    });
    const req = makeReq({ params: { reportId: "1" } });
    const res = makeRes();
    await addCommunityReportLike(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, likeCount: 1 })
    );
  });
});

// ─── removeCommunityReportLike ────────────────────────────────────────────────

describe("removeCommunityReportLike", () => {
  it("returns 404 when the report does not exist", async () => {
    const reportRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    const likeRepo = makeRepo();
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "CommunityReportLike" ? likeRepo : reportRepo
    );
    const req = makeReq({ params: { reportId: "99" } });
    const res = makeRes();
    await removeCommunityReportLike(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("removes the like if it exists and returns 200", async () => {
    const report = { reportId: 1 };
    const like = { id: 5 };
    const reportRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(report) });
    const likeRepo = makeRepo({
      findOne: vi.fn().mockResolvedValue(like),
      remove: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
    });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "CommunityReportLike" ? likeRepo : reportRepo
    );
    const req = makeReq({ params: { reportId: "1" } });
    const res = makeRes();
    await removeCommunityReportLike(req, res);
    expect(likeRepo.remove).toHaveBeenCalledWith(like);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── getCommunityReportComments ───────────────────────────────────────────────

describe("getCommunityReportComments", () => {
  it("returns 400 for an invalid reportId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ params: { reportId: "xyz" } });
    const res = makeRes();
    await getCommunityReportComments(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the report does not exist", async () => {
    const reportRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "CommunityReport" ? reportRepo : makeRepo()
    );
    const req = makeReq({ params: { reportId: "1" } });
    const res = makeRes();
    await getCommunityReportComments(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns comments list on success", async () => {
    const report = { reportId: 1 };
    const comment = { commentId: 10, text: "Be careful!", createdAt: new Date(), user: { id: 2, firstName: "Bob", lastName: "Smith" } };
    const reportRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(report) });
    const commentRepo = makeRepo({ find: vi.fn().mockResolvedValue([comment]) });
    AppDataSource.getRepository.mockImplementation((entity) => {
      if (entity === "CommunityReport") return reportRepo;
      return commentRepo;
    });
    const req = makeReq({ params: { reportId: "1" } });
    const res = makeRes();
    await getCommunityReportComments(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.total).toBe(1);
  });
});

// ─── createCommunityReportComment ────────────────────────────────────────────

describe("createCommunityReportComment", () => {
  it("returns 400 when comment text is empty", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ params: { reportId: "1" }, body: { text: "  " } });
    const res = makeRes();
    await createCommunityReportComment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates a comment and returns 201 on success", async () => {
    const report = { reportId: 1 };
    const user = { id: 1, firstName: "Alice", lastName: "Smith" };
    const savedComment = { commentId: 20, text: "Stay safe!", createdAt: new Date(), user };
    const reportRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(report) });
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(user) });
    const commentRepo = makeRepo({
      create: vi.fn().mockReturnValue({ commentId: 20 }),
      save: vi.fn().mockResolvedValue(savedComment),
      findOne: vi.fn().mockResolvedValue(savedComment),
    });
    AppDataSource.getRepository.mockImplementation((entity) => {
      if (entity === "CommunityReport") return reportRepo;
      if (entity === "User") return userRepo;
      return commentRepo;
    });
    const req = makeReq({ params: { reportId: "1" }, body: { text: "Stay safe!" } });
    const res = makeRes();
    await createCommunityReportComment(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, comment: expect.objectContaining({ text: "Stay safe!" }) })
    );
  });
});

// ─── deleteCommunityReport ────────────────────────────────────────────────────

describe("deleteCommunityReport", () => {
  it("returns 400 for an invalid reportId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ params: { reportId: "bad" } });
    const res = makeRes();
    await deleteCommunityReport(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the report is not owned by this user", async () => {
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = makeReq({ params: { reportId: "5" } });
    const res = makeRes();
    await deleteCommunityReport(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("deletes the report and returns 200", async () => {
    const report = { reportId: 5, user: { id: 1 } };
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(report) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = makeReq({ params: { reportId: "5" } });
    const res = makeRes();
    await deleteCommunityReport(req, res);
    expect(repo.remove).toHaveBeenCalledWith(report);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── getLiveSafetyScore ───────────────────────────────────────────────────────

describe("getLiveSafetyScore", () => {
  // External APIs (Google, OpenWeather, Crime) are NOT called when their
  // API keys are absent. The function gracefully defaults to local calculation only.

  beforeEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.OPENWEATHER_API_KEY;
    delete process.env.CRIME_API_KEY;
  });

  it("returns 400 when lat/lng are missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ query: {}, body: {} });
    const res = makeRes();
    await getLiveSafetyScore(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("lat/lng") })
    );
  });

  it("returns 400 when coordinates are out of valid range", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());
    const req = makeReq({ query: { lat: "200", lng: "300" } });
    const res = makeRes();
    await getLiveSafetyScore(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 with a safety score when no external API keys are configured", async () => {
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([]) });
    AppDataSource.getRepository.mockReturnValue(repo);
    const req = makeReq({ query: { lat: "6.9271", lng: "79.8612" } });
    const res = makeRes();
    await getLiveSafetyScore(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(typeof payload.finalScore).toBe("number");
    expect(payload.finalScore).toBeGreaterThanOrEqual(0);
    expect(payload.finalScore).toBeLessThanOrEqual(100);
  });

  it("lowers the safety score when there are nearby recent community reports", async () => {
    const nearbyReport = {
      reportId: 1,
      reportDate_time: new Date().toISOString(), // very recent
      location: null,
      locationCoordinates: { lat: 6.9271, lng: 79.8612 }, // same spot
    };
    const repoNoReports = makeRepo({ find: vi.fn().mockResolvedValue([]) });
    const repoWithReports = makeRepo({ find: vi.fn().mockResolvedValue([nearbyReport]) });

    // Run once with no nearby reports
    AppDataSource.getRepository.mockReturnValue(repoNoReports);
    const reqClean = makeReq({ query: { lat: "6.9271", lng: "79.8612" } });
    const resClean = makeRes();
    await getLiveSafetyScore(reqClean, resClean);
    const cleanScore = resClean.json.mock.calls[0][0].finalScore;

    // Run again with a nearby report
    vi.clearAllMocks();
    AppDataSource.getRepository.mockReturnValue(repoWithReports);
    const reqDanger = makeReq({ query: { lat: "6.9271", lng: "79.8612" } });
    const resDanger = makeRes();
    await getLiveSafetyScore(reqDanger, resDanger);
    const dangerScore = resDanger.json.mock.calls[0][0].finalScore;

    expect(dangerScore).toBeLessThan(cleanScore);
  });
});
