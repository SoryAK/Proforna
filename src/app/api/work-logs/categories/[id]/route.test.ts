/**
 * Integration tests for /api/work-logs/categories/[id]
 *
 * Auth:        getUserId mock
 * DB:          prisma.workLogCategory + prisma.workLog mocked
 * Pure logic:  validateWorklogCategoryName runs for real (covered in
 *              src/lib/worklog-categories.test.ts).
 *
 * Coverage:
 *   PATCH  — 401 unauth; 404 IDOR; 400 invalid name; 400 reserved 'other';
 *            409 rename collision; 200 happy-path rename (also rewrites
 *            WorkLog.category in a transaction).
 *   DELETE — 401 unauth; 404 IDOR; 200 happy path (bulk-rewrites notes to
 *            WORKLOG_CATEGORY_FALLBACK before deleting the row, all in tx).
 */

import { vi } from "vitest";
import { PATCH, DELETE } from "@/app/api/work-logs/categories/[id]/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogCategory: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workLog: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockCatFindFirst = vi.mocked(prisma.workLogCategory.findFirst);
const mockCatUpdate = vi.mocked(prisma.workLogCategory.update);
const mockCatDelete = vi.mocked(prisma.workLogCategory.delete);
const mockLogUpdateMany = vi.mocked(prisma.workLog.updateMany);
const mockTransaction = vi.mocked(prisma.$transaction);

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/categories/c1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request("http://localhost/api/work-logs/categories/c1", {
    method: "DELETE",
  });
}

const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
describe("PATCH /api/work-logs/categories/[id]", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await PATCH(patchReq({ name: "x" }), ctx);
    expect(res.status).toBe(401);
  });

  it("404 — category not owned by user (IDOR)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ name: "x" }), ctx);
    expect(res.status).toBe(404);
  });

  it("400 — invalid name (empty)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce({
      id: "c1", userId: "user1", name: "old", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const res = await PATCH(patchReq({ name: "  " }), ctx);
    expect(res.status).toBe(400);
  });

  it("400 — reserved 'other' name", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce({
      id: "c1", userId: "user1", name: "old", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const res = await PATCH(patchReq({ name: "Other" }), ctx);
    expect(res.status).toBe(400);
  });

  it("409 — rename collides with an existing category (case-insensitive)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    // First findFirst — load self
    mockCatFindFirst.mockResolvedValueOnce({
      id: "c1", userId: "user1", name: "old", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    // Second findFirst — collision check
    mockCatFindFirst.mockResolvedValueOnce({
      id: "c2", userId: "user1", name: "Standup", sortOrder: 1, createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const res = await PATCH(patchReq({ name: "standup" }), ctx);
    expect(res.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("200 — renames category AND bulk-rewrites WorkLog.category in a transaction", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst
      .mockResolvedValueOnce({
        id: "c1", userId: "user1", name: "old", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
      } as never)
      .mockResolvedValueOnce(null); // no collision
    mockTransaction.mockImplementationOnce((async (ops: unknown[]) => {
      // The route passes [updateMany, update] to $transaction.
      expect(ops).toHaveLength(2);
      return [{ count: 5 }, { id: "c1", userId: "user1", name: "new", sortOrder: 0 }];
    }) as never);

    const res = await PATCH(patchReq({ name: "new" }), ctx);
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("noop rename (same name, different case) updates display name but skips notes rewrite", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce({
      id: "c1", userId: "user1", name: "standup", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    // Collision check: matching the row itself (different id check skips it)
    mockCatFindFirst.mockResolvedValueOnce(null);
    mockCatUpdate.mockResolvedValueOnce({
      id: "c1", userId: "user1", name: "Standup", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const res = await PATCH(patchReq({ name: "Standup" }), ctx);
    expect(res.status).toBe(200);
    // No transaction because the lowercase comparison matched (same canonical name).
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockCatUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────
describe("DELETE /api/work-logs/categories/[id]", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(401);
  });

  it("404 — category not owned by user", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(404);
  });

  it("200 — rewrites notes to 'other' and deletes the row in a transaction", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce({
      id: "c1", userId: "user1", name: "training", sortOrder: 5, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    mockTransaction.mockImplementationOnce((async (ops: unknown[]) => {
      // Expect [updateMany(workLog), delete(workLogCategory)]
      expect(ops).toHaveLength(2);
      return [{ count: 7 }, { id: "c1" }];
    }) as never);

    const res = await DELETE(deleteReq(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.rewroteNotes).toBe(7);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
