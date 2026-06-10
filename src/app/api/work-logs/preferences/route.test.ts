/**
 * ADR-0023 — RED tests for extended GET /api/work-logs/preferences
 *
 * Adds two new fields to the response payload:
 *   readerRailTab       — "backlinks" | "history" | "tags" | "photos"
 *   readerRailCollapsed — boolean
 *
 * Empty-preferences default: readerRailTab="backlinks", readerRailCollapsed=false
 *
 * Auth: getUserId mock
 * DB:   prisma.workLogPreference.findUnique mocked
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/preferences/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    workHistory: {
      findFirst: vi.fn(),
    },
    workHistoryShift: {
      findFirst: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockFindUnique = vi.mocked(prisma.workLogPreference.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/work-logs/preferences — ADR-0023 rail fields", () => {
  it("401 — unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("200 — first-time user (no row) returns empty defaults including rail state", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindUnique.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.readerRailTab).toBe("backlinks");
    expect(json.readerRailCollapsed).toBe(false);
  });

  it("200 — projects existing rail state from DB", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindUnique.mockResolvedValue({
      defaultPositionId: null,
      defaultShiftId: null,
      defaultCategory: "task",
      defaultMood: null,
      defaultHours: null,
      voiceDictationConsentedAt: null,
      readerRailTab: "history",
      readerRailCollapsed: true,
      defaultShift: null,
    } as any);

    const res = await GET();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.readerRailTab).toBe("history");
    expect(json.readerRailCollapsed).toBe(true);
  });

  it("200 — projects rail state alongside legacy fields without disturbing them", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindUnique.mockResolvedValue({
      defaultPositionId: null,
      defaultShiftId: null,
      defaultCategory: "meeting",
      defaultMood: "good",
      defaultHours: 8,
      voiceDictationConsentedAt: null,
      readerRailTab: "tags",
      readerRailCollapsed: false,
      defaultShift: null,
    } as any);

    const res = await GET();

    expect(res.status).toBe(200);
    const json = await res.json();
    // Legacy fields preserved
    expect(json.defaultCategory).toBe("meeting");
    expect(json.defaultMood).toBe("good");
    expect(json.defaultHours).toBe(8);
    // Rail fields present
    expect(json.readerRailTab).toBe("tags");
    expect(json.readerRailCollapsed).toBe(false);
  });

  it("200 — invalid tab value coming back from DB is sanitized to 'backlinks'", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindUnique.mockResolvedValue({
      defaultPositionId: null,
      defaultShiftId: null,
      defaultCategory: "task",
      defaultMood: null,
      defaultHours: null,
      voiceDictationConsentedAt: null,
      readerRailTab: "garbage-value",
      readerRailCollapsed: false,
      defaultShift: null,
    } as any);

    const res = await GET();

    const json = await res.json();
    expect(json.readerRailTab).toBe("backlinks");
  });
});
