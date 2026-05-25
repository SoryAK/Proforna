/**
 * T5.3 — Integration tests for POST /api/work-logs/reorder
 *
 * Auth: getUserId mock
 * DB:   prisma.workLog.findMany + prisma.$transaction mocked
 *
 * Coverage: 401, 400 (validation), 404 (IDOR), 200 (happy-path + reparent), 500
 */

import { vi } from "vitest";
import { POST } from "@/app/api/work-logs/reorder/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

// ── typed handles ──────────────────────────────────────────────────────────
const mockGetUserId = vi.mocked(getUserId);
const mockFindMany = vi.mocked(prisma.workLog.findMany);
const mockTransaction = vi.mocked(prisma.$transaction);

// ── request factory ────────────────────────────────────────────────────────
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────
describe("POST /api/work-logs/reorder", () => {
  // ── auth ──────────────────────────────────────────────

  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await POST(makeRequest({ items: [{ id: "a", sortOrder: 0 }] }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  // ── input validation ──────────────────────────────────

  it("400 — missing items key returns error", async () => {
    mockGetUserId.mockResolvedValue("user1");

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
  });

  it("400 — 201 items (exceeds MAX_ITEMS=200) returns error", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const items = Array.from({ length: 201 }, (_, i) => ({ id: `id${i}`, sortOrder: i }));

    const res = await POST(makeRequest({ items }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("200");
  });

  it("400 — item with negative sortOrder is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");

    const res = await POST(makeRequest({ items: [{ id: "x", sortOrder: -1 }] }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/sortOrder/i);
  });

  it("400 — item id exceeding 64 characters is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");

    const res = await POST(makeRequest({ items: [{ id: "x".repeat(65), sortOrder: 0 }] }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/id/i);
  });

  // ── ownership / IDOR ──────────────────────────────────

  it("404 — IDOR: one id does not belong to the authenticated user", async () => {
    mockGetUserId.mockResolvedValue("user1");
    // Two ids sent, but DB only owns one of them
    mockFindMany.mockResolvedValue([{ id: "a" }] as any);

    const res = await POST(
      makeRequest({ items: [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }] }),
    );

    expect(res.status).toBe(404);
  });

  // ── happy path ────────────────────────────────────────

  it("200 — reorder 3 notes within the same folder", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }] as any);
    mockTransaction.mockImplementation(async (fn: any) => {
      const mockTx = { workLog: { update: vi.fn().mockResolvedValue({}) } };
      return fn(mockTx);
    });

    const res = await POST(
      makeRequest({
        items: [
          { id: "a", sortOrder: 0, folderId: "f1" },
          { id: "b", sortOrder: 1, folderId: "f1" },
          { id: "c", sortOrder: 2, folderId: "f1" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.affected).toBe(3);
  });

  it("200 — reparent: note moved to a different folder", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindMany.mockResolvedValue([{ id: "a" }] as any);
    mockTransaction.mockImplementation(async (fn: any) => {
      const mockTx = { workLog: { update: vi.fn().mockResolvedValue({}) } };
      return fn(mockTx);
    });

    const res = await POST(
      makeRequest({ items: [{ id: "a", sortOrder: 0, folderId: "folder-new" }] }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.affected).toBe(1);
  });

  // ── error handling ────────────────────────────────────

  it("500 — database error during transaction returns generic error", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindMany.mockResolvedValue([{ id: "a" }] as any);
    mockTransaction.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeRequest({ items: [{ id: "a", sortOrder: 0 }] }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
    // Raw DB error must not be forwarded to the client
    expect(json.error).not.toContain("DB connection lost");
  });
});
