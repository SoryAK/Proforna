/**
 * Tests for GET /api/work-logs/[id]/versions — ADR-0017 Phase 4.
 *
 * Coverage:
 *  - 401 unauthenticated
 *  - 404 when workLog absent OR belongs to another user (same response)
 *  - returns [] when no versions exist
 *  - newest-first ordering
 *  - plainTextPreview truncation (200 chars + "…")
 *  - charDelta is computed in chronological order (oldest = delta vs "")
 *  - contentJson is NEVER in the payload (list-view bloat guard)
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/[id]/versions/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findFirst: vi.fn(),
    },
    workLogVersion: {
      findMany: vi.fn(),
    },
  },
}));

const mockGetUserId         = vi.mocked(getUserId);
const mockWorkLogFindFirst  = vi.mocked(prisma.workLog.findFirst);
const mockVersionFindMany   = vi.mocked(prisma.workLogVersion.findMany);

function makeRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost/api/work-logs/${id}/versions`);
  return [req, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/work-logs/[id]/versions", () => {
  it("401 — unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1");

    const res = await GET(req, ctx);

    expect(res.status).toBe(401);
    expect(mockWorkLogFindFirst).not.toHaveBeenCalled();
  });

  it("404 — work log does not exist for this user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue(null);

    const [req, ctx] = makeRequest("nope");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    expect(mockVersionFindMany).not.toHaveBeenCalled();
  });

  it("404 — work log exists but belongs to another user (existence not leaked)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    // findFirst is scoped by userId in the route → returns null for u2's log.
    mockWorkLogFindFirst.mockResolvedValue(null);

    const [req, ctx] = makeRequest("log-belonging-to-u2");
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    // Same response code/body as "doesn't exist" — no information disclosure.
  });

  it("returns [] when no versions exist for this work log", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makeRequest("log1");
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns versions in newest-first order", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    const now = Date.now();
    mockVersionFindMany.mockResolvedValue([
      { id: "v3", createdAt: new Date(now), label: null, isManual: false, plainText: "ccc" },
      { id: "v2", createdAt: new Date(now - 60_000), label: null, isManual: false, plainText: "bb" },
      { id: "v1", createdAt: new Date(now - 120_000), label: null, isManual: false, plainText: "a" },
    ] as any);

    const [req, ctx] = makeRequest("log1");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { id: string }[];

    expect(body.map((v) => v.id)).toEqual(["v3", "v2", "v1"]);
  });

  it("truncates plainTextPreview to 200 chars with ellipsis", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    const longText = "x".repeat(500);
    mockVersionFindMany.mockResolvedValue([
      { id: "v1", createdAt: new Date(), label: null, isManual: false, plainText: longText },
    ] as any);

    const [req, ctx] = makeRequest("log1");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { plainTextPreview: string }[];

    expect(body[0].plainTextPreview).toHaveLength(201); // 200 chars + "…"
    expect(body[0].plainTextPreview.endsWith("…")).toBe(true);
    expect(body[0].plainTextPreview.slice(0, 200)).toBe("x".repeat(200));
  });

  it("returns the full plainText as preview when under the truncation threshold", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([
      { id: "v1", createdAt: new Date(), label: null, isManual: false, plainText: "short text" },
    ] as any);

    const [req, ctx] = makeRequest("log1");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { plainTextPreview: string }[];

    expect(body[0].plainTextPreview).toBe("short text");
  });

  it("computes charDelta in chronological order (oldest row = delta vs '')", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    const now = Date.now();
    mockVersionFindMany.mockResolvedValue([
      { id: "v3", createdAt: new Date(now),           label: null, isManual: false, plainText: "x".repeat(80)  }, // delta vs v2 = 80 - 50 = 30
      { id: "v2", createdAt: new Date(now - 60_000),  label: null, isManual: false, plainText: "x".repeat(50)  }, // delta vs v1 = 50 - 10 = 40
      { id: "v1", createdAt: new Date(now - 120_000), label: null, isManual: false, plainText: "x".repeat(10)  }, // delta vs "" = 10
    ] as any);

    const [req, ctx] = makeRequest("log1");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { id: string; charDelta: number }[];

    // Response is newest-first, but deltas reference the chronologically-prior row.
    expect(body.find((v) => v.id === "v1")?.charDelta).toBe(10);
    expect(body.find((v) => v.id === "v2")?.charDelta).toBe(40);
    expect(body.find((v) => v.id === "v3")?.charDelta).toBe(30);
  });

  it("treats null plainText as empty string for delta and preview", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([
      { id: "v1", createdAt: new Date(), label: null, isManual: false, plainText: null },
    ] as any);

    const [req, ctx] = makeRequest("log1");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { plainTextPreview: string; charDelta: number }[];

    expect(body[0].plainTextPreview).toBe("");
    expect(body[0].charDelta).toBe(0);
  });

  it("preserves label and isManual fields", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([
      { id: "v1", createdAt: new Date(), label: "first draft", isManual: true, plainText: "hi" },
    ] as any);

    const [req, ctx] = makeRequest("log1");
    const res = await GET(req, ctx);
    const body = (await res.json()) as { label: string | null; isManual: boolean }[];

    expect(body[0].label).toBe("first draft");
    expect(body[0].isManual).toBe(true);
  });

  it("never includes contentJson in the response payload (list-view bloat guard)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([
      { id: "v1", createdAt: new Date(), label: null, isManual: false, plainText: "hi" },
    ] as any);

    const [req, ctx] = makeRequest("log1");
    await GET(req, ctx);

    // Verify the prisma select itself excluded contentJson.
    const arg = mockVersionFindMany.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(arg.select.contentJson).toBeFalsy();
  });
});
