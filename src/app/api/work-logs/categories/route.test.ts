/**
 * Integration tests for /api/work-logs/categories
 *
 * Auth:        getUserId mock
 * DB:          prisma.workLogCategory + prisma.workLog mocked
 * Pure logic:  validateWorklogCategoryName runs for real (covered in
 *              src/lib/worklog-categories.test.ts).
 *
 * Coverage:
 *   GET  — 401 unauth; auto-seeds task/project/meeting + any legacy
 *          WorkLog.category strings when the user has zero rows; returns
 *          existing rows otherwise.
 *   POST — 401 unauth; 400 invalid; 400 reserved 'other'; 409 duplicate;
 *          201 create.
 */

import { vi } from "vitest";
import { GET, POST } from "@/app/api/work-logs/categories/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    workLog: {
      findMany: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockCatFindMany = vi.mocked(prisma.workLogCategory.findMany);
const mockCatFindFirst = vi.mocked(prisma.workLogCategory.findFirst);
const mockCatCreate = vi.mocked(prisma.workLogCategory.create);
const mockCatCreateMany = vi.mocked(prisma.workLogCategory.createMany);
const mockLogFindMany = vi.mocked(prisma.workLog.findMany);

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
describe("GET /api/work-logs/categories", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns existing categories without seeding when user has rows", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindMany.mockResolvedValueOnce([
      { id: "c1", userId: "user1", name: "task", sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: "c2", userId: "user1", name: "project", sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.categories.map((c: { name: string }) => c.name)).toEqual(["task", "project"]);
    expect(mockCatCreateMany).not.toHaveBeenCalled();
  });

  it("seeds task/project/meeting + legacy WorkLog.category strings on first load", async () => {
    mockGetUserId.mockResolvedValue("user1");
    // First findMany: returns empty (no categories yet) → triggers seed branch
    mockCatFindMany.mockResolvedValueOnce([] as never);
    // Distinct WorkLog.category strings — user already has notes tagged
    // 'training' and 'meeting' from the legacy hard-coded list.
    mockLogFindMany.mockResolvedValueOnce([
      { category: "training" },
      { category: "meeting" },
      { category: "other" }, // reserved — must be filtered out of seed set
      { category: "" }, // empty — filtered
    ] as never);
    mockCatCreateMany.mockResolvedValueOnce({ count: 4 } as never);
    // Second findMany: returns the freshly seeded rows.
    mockCatFindMany.mockResolvedValueOnce([
      { id: "s1", userId: "user1", name: "task", sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: "s2", userId: "user1", name: "project", sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: "s3", userId: "user1", name: "meeting", sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
      { id: "s4", userId: "user1", name: "training", sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockCatCreateMany).toHaveBeenCalledTimes(1);
    const args = mockCatCreateMany.mock.calls[0][0] as { data: Array<{ name: string }> };
    const seededNames = args.data.map((d) => d.name);
    // Seeds are present, "other" filtered, "meeting" deduped (one row only).
    expect(seededNames).toContain("task");
    expect(seededNames).toContain("project");
    expect(seededNames).toContain("meeting");
    expect(seededNames).toContain("training");
    expect(seededNames).not.toContain("other");
    expect(seededNames).not.toContain("");
    expect(seededNames.filter((n) => n === "meeting")).toHaveLength(1);

    expect(json.categories).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────
describe("POST /api/work-logs/categories", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(postReq({ name: "standup" }));
    expect(res.status).toBe(401);
  });

  it("400 — empty name", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(postReq({ name: "   " }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/required/i);
  });

  it("400 — reserved 'other' name (any case)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(postReq({ name: "Other" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/reserved/i);
    expect(mockCatCreate).not.toHaveBeenCalled();
  });

  it("400 — name longer than 40 chars", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(postReq({ name: "a".repeat(41) }));
    expect(res.status).toBe(400);
  });

  it("409 — duplicate name (case-insensitive)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce({
      id: "existing", userId: "user1", name: "Standup", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const res = await POST(postReq({ name: "standup" }));
    expect(res.status).toBe(409);
    expect(mockCatCreate).not.toHaveBeenCalled();
  });

  it("201 — creates the category", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockCatFindFirst.mockResolvedValueOnce(null);
    mockCatFindMany.mockResolvedValueOnce([{ sortOrder: 2 }] as never); // for next sort order
    mockCatCreate.mockResolvedValueOnce({
      id: "new1", userId: "user1", name: "standup", sortOrder: 3, createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const res = await POST(postReq({ name: "  standup  " }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.name).toBe("standup");
    const createArgs = mockCatCreate.mock.calls[0][0] as { data: { name: string; userId: string; sortOrder: number } };
    expect(createArgs.data.name).toBe("standup"); // trimmed
    expect(createArgs.data.userId).toBe("user1");
  });
});
