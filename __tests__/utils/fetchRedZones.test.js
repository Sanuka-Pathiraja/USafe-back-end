import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseClient so no real Supabase connection is made
const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("../../utils/supabaseClient.js", () => ({
  default: {
    from: vi.fn().mockReturnValue({
      select: mockSelect,
    }),
  },
}));

import fetchRedZones from "../../utils/fetchRedZones.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchRedZones", () => {
  it("returns an empty array when no reports have coordinates", async () => {
    mockSelect.mockReturnValue({
      not: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await fetchRedZones();
    expect(result).toEqual([]);
  });

  it("maps each row into { lat, lon, radius } with a fixed 50m radius", async () => {
    mockSelect.mockReturnValue({
      not: vi.fn().mockResolvedValue({
        data: [
          { locationCoordinates: { lat: 6.9271, lng: 79.8612 } },
          { locationCoordinates: { lat: 7.2906, lng: 80.6337 } },
        ],
        error: null,
      }),
    });

    const result = await fetchRedZones();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lat: 6.9271, lon: 79.8612, radius: 50 });
    expect(result[1]).toEqual({ lat: 7.2906, lon: 80.6337, radius: 50 });
  });

  it("throws when Supabase returns an error", async () => {
    mockSelect.mockReturnValue({
      not: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "connection refused" },
      }),
    });

    await expect(fetchRedZones()).rejects.toThrow("Could not load redzones from database.");
  });

  it("returns correct lat/lon from locationCoordinates object", async () => {
    mockSelect.mockReturnValue({
      not: vi.fn().mockResolvedValue({
        data: [{ locationCoordinates: { lat: 6.0, lng: 80.0 } }],
        error: null,
      }),
    });

    const result = await fetchRedZones();
    expect(result[0].lat).toBe(6.0);
    expect(result[0].lon).toBe(80.0);
  });
});
