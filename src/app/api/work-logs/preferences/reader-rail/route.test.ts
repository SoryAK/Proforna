/**
 * ADR-0023 — RED tests for new POST /api/work-logs/preferences/reader-rail
 *
 * Persists per-user reader right-rail state (active tab + collapsed flag).
 *
 * Auth: getUserId mock
 * DB:   prisma.workLogPreference.upsert mocked
 *
 * Coverage: 401, 400 (empty body), 400 (invalid tab), 200 (partial tab),
 *           200 (partial collapsed), 200 (both), 200 (upsert-create)
 */

import { vi } from "vitest";
import { POST } from "@/app/api/work-logs/preferences/reader-rail/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogPreference: {
      upsert: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockUpsert = vi.mocked(prisma.workLogPreference.upsert);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/preferences/reader-rail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/work-logs/preferences/reader-rail", () => {
  // ── auth ──────────────────────────────────────────────

  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await POST(makeRequest({ tab: "history" }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  // ── input validation ──────────────────────────────────

  it("400 — empty body (neither tab nor collapsed) returns error", async () => {
    mockGetUserId.mockResolvedValue("user1");

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("400 — invalid tab value is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");

    const res = await POST(makeRequest({ tab: "not-a-real-tab" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/tab/i);
  });

  it("400 — non-boolean collapsed value is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");

    const res = await POST(makeRequest({ collapsed: "yes" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/collapsed/i);
  });

  // ── happy path: partial updates ───────────────────────

  it("200 — partial update: tab only (collapsed left untouched in DB)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockUpsert.mockResolvedValue({
      readerRailTab: "history",
      readerRailCollapsed: false,
    } as any);

    const res = await POST(makeRequest({ tab: "history" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ tab: "history", collapsed: false });

    // Verify upsert.update payload contains only tab (no collapsed key)
    const callArg = mockUpsert.mock.calls[0]?.[0] as any;
    expect(callArg.update).toEqual({ readerRailTab: "history" });
  });

  it("200 — partial update: collapsed only (tab left untouched in DB)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockUpsert.mockResolvedValue({
      readerRailTab: "backlinks",
      readerRailCollapsed: true,
    } as any);

    const res = await POST(makeRequest({ collapsed: true }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ tab: "backlinks", collapsed: true });

    const callArg = mockUpsert.mock.calls[0]?.[0] as any;
    expect(callArg.update).toEqual({ readerRailCollapsed: true });
  });

  it("200 — full update: both tab and collapsed", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockUpsert.mockResolvedValue({
      readerRailTab: "properties",
      readerRailCollapsed: true,
    } as any);

    const res = await POST(makeRequest({ tab: "properties", collapsed: true }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ tab: "properties", collapsed: true });

    const callArg = mockUpsert.mock.calls[0]?.[0] as any;
    expect(callArg.update).toEqual({
      readerRailTab: "properties",
      readerRailCollapsed: true,
    });
  });

  // ── upsert-create for first-time user ─────────────────

  it("200 — upsert-create: first-time user gets a row with defaults + override", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockUpsert.mockResolvedValue({
      readerRailTab: "photos",
      readerRailCollapsed: false,
    } as any);

    const res = await POST(makeRequest({ tab: "photos" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ tab: "photos", collapsed: false });

    // Create branch must include userId + tab override; collapsed falls to DB default
    const callArg = mockUpsert.mock.calls[0]?.[0] as any;
    expect(callArg.where).toEqual({ userId: "user1" });
    expect(callArg.create).toMatchObject({ userId: "user1", readerRailTab: "photos" });
  });

  // ── all four valid tabs accepted ──────────────────────

  it.each(["backlinks", "history", "properties", "photos"])(
    "200 — accepts tab=%s",
    async (tab) => {
      mockGetUserId.mockResolvedValue("user1");
      mockUpsert.mockResolvedValue({
        readerRailTab: tab,
        readerRailCollapsed: false,
      } as any);

      const res = await POST(makeRequest({ tab }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tab).toBe(tab);
    },
  );

  // ── ADR-0025: legacy "tags" alias is rewritten to "properties" ─────────

  it("200 — legacy tab=\"tags\" is aliased to \"properties\" and persisted as such", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockUpsert.mockResolvedValue({
      readerRailTab: "properties",
      readerRailCollapsed: false,
    } as any);

    const res = await POST(makeRequest({ tab: "tags" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ tab: "properties", collapsed: false });

    const callArg = mockUpsert.mock.calls[0]?.[0] as any;
    expect(callArg.update).toEqual({ readerRailTab: "properties" });
    expect(callArg.create).toMatchObject({ userId: "user1", readerRailTab: "properties" });
  });
});
