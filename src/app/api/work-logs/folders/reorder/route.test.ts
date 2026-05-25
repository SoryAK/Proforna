/**
 * T5.4 — Integration tests for POST /api/work-logs/folders/reorder
 *
 * Auth:        getUserId mock
 * DB:          prisma.workLogFolder.findMany + prisma.$transaction mocked
 * Pure logic:  assertNoCycle and getDepth run for real (no mock) — they are
 *              tested in isolation in worklog-folders.test.ts.
 *
 * Coverage: 401, 400 (validation, cycle, depth), 404 (IDOR, unknown parent),
 *           200 (happy-path reorder, reparent to root), 500
 */

import { vi } from "vitest";
import { POST } from "@/app/api/work-logs/folders/reorder/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { FOLDER_MAX_DEPTH } from "@/lib/worklog-folders";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogFolder: {
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
const mockFindMany = vi.mocked(prisma.workLogFolder.findMany);
const mockTransaction = vi.mocked(prisma.$transaction);

// ── request factory ────────────────────────────────────────────────────────
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/folders/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // resetAllMocks clears the Once-queue as well as call history,
  // preventing unconsumed Once values from contaminating later tests.
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
describe("POST /api/work-logs/folders/reorder", () => {
  // ── auth ──────────────────────────────────────────────

  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await POST(makeRequest({ items: [{ id: "a", sortOrder: 0 }] }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  // ── input validation ──────────────────────────────────

  it("400 — empty items array is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");

    const res = await POST(makeRequest({ items: [] }));

    expect(res.status).toBe(400);
  });

  it("400 — 201 items (exceeds MAX_ITEMS=200) returns error", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const items = Array.from({ length: 201 }, (_, i) => ({ id: `fid${i}`, sortOrder: i }));

    const res = await POST(makeRequest({ items }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("200");
  });

  // ── ownership / IDOR ──────────────────────────────────

  it("404 — IDOR: one folder id does not belong to the authenticated user", async () => {
    mockGetUserId.mockResolvedValue("user1");
    // Only "fa" is owned; "fb" is not
    mockFindMany.mockResolvedValue([{ id: "fa" }] as any);

    const res = await POST(
      makeRequest({ items: [{ id: "fa", sortOrder: 0 }, { id: "fb", sortOrder: 1 }] }),
    );

    expect(res.status).toBe(404);
  });

  // ── cycle detection ────────────────────────────────────
  //
  // Tree: a (root) → b (child of a)
  // Trying to move "a" under "b" creates a cycle: b.parentId would stay "a",
  // so following b's ancestors reaches "a" — assertNoCycle throws.

  it("400 — cycle: moving a folder under one of its own descendants is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");

    // Call 1: ownership check — only the id in items ("a"); "b" is the target parent, not being moved
    // Call 2: all user folders for cycle/depth check (select id + parentId)
    mockFindMany
      .mockResolvedValueOnce([{ id: "a" }] as any)
      .mockResolvedValueOnce([
        { id: "a", parentId: null },
        { id: "b", parentId: "a" },
      ] as any);

    // Move "a" under "b" — direct cycle
    const res = await POST(
      makeRequest({ items: [{ id: "a", sortOrder: 0, parentId: "b" }] }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/cycle|descendant/i);
  });

  // ── depth limit ────────────────────────────────────────
  //
  // Build a chain FOLDER_MAX_DEPTH levels deep (f0 → f1 → … → f{N-1}).
  // Moving "target" under the deepest node would exceed FOLDER_MAX_DEPTH.

  it(`400 — depth: moving beyond ${FOLDER_MAX_DEPTH}-level limit is rejected`, async () => {
    mockGetUserId.mockResolvedValue("user1");

    // Chain: f0 (root), f1 … f{FOLDER_MAX_DEPTH-1} — FOLDER_MAX_DEPTH nodes
    const chain = Array.from({ length: FOLDER_MAX_DEPTH }, (_, i) => ({
      id: `f${i}`,
      parentId: i === 0 ? null : `f${i - 1}`,
    }));
    const deepestId = `f${FOLDER_MAX_DEPTH - 1}`; // depth FOLDER_MAX_DEPTH-1

    // Call 1: ownership check — "target" is owned
    mockFindMany.mockResolvedValueOnce([{ id: "target" }] as any);
    // Call 2: all user folders — the chain + target (target is currently at root)
    mockFindMany.mockResolvedValueOnce([
      ...chain,
      { id: "target", parentId: null },
    ] as any);

    // Moving "target" under the deepest node: depth = (FOLDER_MAX_DEPTH-1) + 1 = FOLDER_MAX_DEPTH ≥ limit
    const res = await POST(
      makeRequest({ items: [{ id: "target", sortOrder: 0, parentId: deepestId }] }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/nesting|depth|limit/i);
  });

  // ── unknown parent ────────────────────────────────────

  it("404 — new parentId not in user's folder list is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");

    // Call 1: ownership check — "folder-a" is owned
    mockFindMany.mockResolvedValueOnce([{ id: "folder-a" }] as any);
    // Call 2: all user folders — "unknown-parent" is NOT present
    mockFindMany.mockResolvedValueOnce([{ id: "folder-a", parentId: null }] as any);

    const res = await POST(
      makeRequest({
        items: [{ id: "folder-a", sortOrder: 0, parentId: "unknown-parent" }],
      }),
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/parent folder/i);
  });

  // ── happy path ────────────────────────────────────────

  it("200 — happy path: reorder two sibling folders (no reparent)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    // No parentId field in items → reparentItems is empty → only one findMany call
    mockFindMany.mockResolvedValue([{ id: "fa" }, { id: "fb" }] as any);
    mockTransaction.mockImplementation(async (fn: any) => {
      const mockTx = { workLogFolder: { update: vi.fn().mockResolvedValue({}) } };
      return fn(mockTx);
    });

    const res = await POST(
      makeRequest({ items: [{ id: "fa", sortOrder: 1 }, { id: "fb", sortOrder: 0 }] }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.affected).toBe(2);
  });

  it("200 — reparent to root (parentId: null) skips cycle/depth checks", async () => {
    mockGetUserId.mockResolvedValue("user1");

    // Call 1: ownership check
    mockFindMany.mockResolvedValueOnce([{ id: "child" }] as any);
    // Call 2: all folders (fetched because parentId is present in item)
    mockFindMany.mockResolvedValueOnce([
      { id: "parent", parentId: null },
      { id: "child", parentId: "parent" },
    ] as any);

    mockTransaction.mockImplementation(async (fn: any) => {
      const mockTx = { workLogFolder: { update: vi.fn().mockResolvedValue({}) } };
      return fn(mockTx);
    });

    // null parentId → server skips cycle and depth checks (newParentId === null → continue)
    const res = await POST(
      makeRequest({ items: [{ id: "child", sortOrder: 0, parentId: null }] }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.affected).toBe(1);
  });

  // ── error handling ────────────────────────────────────

  it("500 — database error during transaction returns generic error", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindMany.mockResolvedValue([{ id: "fa" }] as any);
    mockTransaction.mockRejectedValue(new Error("Deadlock detected"));

    const res = await POST(makeRequest({ items: [{ id: "fa", sortOrder: 0 }] }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
    // Raw DB error must not be forwarded to the client
    expect(json.error).not.toContain("Deadlock");
  });
});
