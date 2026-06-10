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
import { GET, POST } from "@/app/api/work-logs/[id]/versions/route";
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
      create:   vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const mockGetUserId         = vi.mocked(getUserId);
const mockWorkLogFindFirst  = vi.mocked(prisma.workLog.findFirst);
const mockVersionFindMany   = vi.mocked(prisma.workLogVersion.findMany);
const mockVersionCreate     = vi.mocked(prisma.workLogVersion.create);
const mockVersionDeleteMany = vi.mocked(prisma.workLogVersion.deleteMany);

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

// ──────────────────────────────────────────────────────
// POST /api/work-logs/[id]/versions — manual snapshot
// ──────────────────────────────────────────────────────

function makePostRequest(
  id: string,
  body: unknown,
): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost/api/work-logs/${id}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id }) }];
}

const sampleDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};

describe("POST /api/work-logs/[id]/versions — manual snapshot", () => {
  it("401 — unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);
    const [req, ctx] = makePostRequest("log1", { label: "milestone" });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    expect(mockVersionCreate).not.toHaveBeenCalled();
  });

  it("404 — work log does not exist or belongs to another user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue(null);
    const [req, ctx] = makePostRequest("nope", { label: "milestone" });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    expect(mockVersionCreate).not.toHaveBeenCalled();
  });

  it("400 — refuses to snapshot when the note has no contentJson yet", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: null,
      content: "",
    } as any);
    const [req, ctx] = makePostRequest("log1", { label: "milestone" });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect(mockVersionCreate).not.toHaveBeenCalled();
  });

  it("400 — rejects labels longer than 80 chars", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: sampleDoc,
      content: "hello",
    } as any);
    const [req, ctx] = makePostRequest("log1", { label: "x".repeat(81) });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect(mockVersionCreate).not.toHaveBeenCalled();
  });

  it("creates a manual snapshot capturing live contentJson + plainText", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: sampleDoc,
      content: "hello",
    } as any);
    mockVersionCreate.mockResolvedValue({
      id: "v-new",
      createdAt: new Date("2026-06-09T20:00:00Z"),
      label: "milestone",
      isManual: true,
      plainText: "hello",
    } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makePostRequest("log1", { label: "milestone" });
    const res = await POST(req, ctx);

    expect(res.status).toBe(201);
    expect(mockVersionCreate).toHaveBeenCalledTimes(1);
    const arg = mockVersionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.workLogId).toBe("log1");
    expect(arg.data.userId).toBe("u1");
    expect(arg.data.isManual).toBe(true);
    expect(arg.data.label).toBe("milestone");
    expect(arg.data.contentJson).toEqual(sampleDoc);
    expect(arg.data.plainText).toBe("hello");
  });

  it("trims whitespace from the label and persists null when label is omitted", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: sampleDoc,
      content: "hello",
    } as any);
    mockVersionCreate.mockResolvedValue({
      id: "v-new",
      createdAt: new Date(),
      label: null,
      isManual: true,
      plainText: "hello",
    } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makePostRequest("log1", {}); // no label
    await POST(req, ctx);

    const arg = mockVersionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.label).toBeNull();

    // Whitespace-only label should also collapse to null.
    mockVersionCreate.mockClear();
    const [req2, ctx2] = makePostRequest("log1", { label: "   " });
    await POST(req2, ctx2);
    const arg2 = mockVersionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg2.data.label).toBeNull();
  });

  it("returns the new row without contentJson (parity with GET shape)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: sampleDoc,
      content: "hello",
    } as any);
    mockVersionCreate.mockResolvedValue({
      id: "v-new",
      createdAt: new Date("2026-06-09T20:00:00Z"),
      label: "ms",
      isManual: true,
      plainText: "hello",
    } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makePostRequest("log1", { label: "ms" });
    const res = await POST(req, ctx);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).not.toHaveProperty("contentJson");
    expect(body.id).toBe("v-new");
    expect(body.isManual).toBe(true);
    expect(body.label).toBe("ms");
    expect(body.plainTextPreview).toBe("hello");
  });

  it("runs manual-cap retention after a successful manual snapshot", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: sampleDoc,
      content: "hello",
    } as any);
    mockVersionCreate.mockResolvedValue({
      id: "v-new",
      createdAt: new Date(),
      label: "ms",
      isManual: true,
      plainText: "hello",
    } as any);

    // Simulate the post-create state: 52 manual snapshots → 2 must be evicted.
    const NOW = Date.now();
    mockVersionFindMany.mockResolvedValue(
      Array.from({ length: 52 }, (_, i) => ({
        id: `m${String(i).padStart(3, "0")}`,
        createdAt: new Date(NOW - i * 60_000),
        isManual: true,
      })) as any,
    );
    mockVersionDeleteMany.mockResolvedValue({ count: 2 } as any);

    const [req, ctx] = makePostRequest("log1", { label: "ms" });
    await POST(req, ctx);

    expect(mockVersionDeleteMany).toHaveBeenCalledTimes(1);
    const arg = mockVersionDeleteMany.mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(arg.where.id.in).toHaveLength(2);
  });

  it("retention failure does NOT fail the manual snapshot itself (best-effort)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: sampleDoc,
      content: "hello",
    } as any);
    mockVersionCreate.mockResolvedValue({
      id: "v-new",
      createdAt: new Date(),
      label: "ms",
      isManual: true,
      plainText: "hello",
    } as any);
    mockVersionFindMany.mockRejectedValue(new Error("db unavailable"));

    const [req, ctx] = makePostRequest("log1", { label: "ms" });
    const res = await POST(req, ctx);

    expect(res.status).toBe(201);
  });
});
