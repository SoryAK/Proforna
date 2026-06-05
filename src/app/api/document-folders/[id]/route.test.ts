/**
 * Integration tests for /api/document-folders/[id]
 *
 * Coverage:
 *   - PATCH self-move guard (target === id)
 *   - PATCH descendant guard (target is a child/grandchild of id)
 *   - PATCH name uniqueness collision (P2002 → 409)
 *   - DELETE on non-empty folder without cascade (409 + counts)
 *   - DELETE on non-empty folder with cascade=1 (200)
 *   - 401, 404 (cross-user IDOR) cases
 *
 * Auth:  getUserId mocked
 * DB:    prisma.documentFolder mocks
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { PATCH, DELETE } from "@/app/api/document-folders/[id]/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentFolder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockFindFirst = vi.mocked(prisma.documentFolder.findFirst);
const mockFindMany = vi.mocked(prisma.documentFolder.findMany);
const mockUpdate = vi.mocked(prisma.documentFolder.update);
const mockDelete = vi.mocked(prisma.documentFolder.delete);

function patchReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/document-folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function deleteReq(id: string, cascade?: boolean): Request {
  const url = `http://localhost/api/document-folders/${id}${cascade ? "?cascade=1" : ""}`;
  return new Request(url, { method: "DELETE" });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /api/document-folders/[id]", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await PATCH(patchReq("f1", { name: "x" }), ctx("f1"));
    expect(res.status).toBe(401);
  });

  it("404 — folder does not belong to user (IDOR)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce(null); // folder ownership check fails
    const res = await PATCH(patchReq("f1", { name: "x" }), ctx("f1"));
    expect(res.status).toBe(404);
  });

  it("400 — rejects move into self", async () => {
    mockGetUserId.mockResolvedValue("user1");
    // ownership check
    mockFindFirst.mockResolvedValueOnce({ id: "f1" } as never);
    // descendant BFS: empty children frontier
    mockFindMany.mockResolvedValueOnce([]);
    const res = await PATCH(patchReq("f1", { parentId: "f1" }), ctx("f1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/itself or its descendants/i);
  });

  it("400 — rejects move into descendant (grandchild)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce({ id: "f1" } as never); // ownership
    // BFS: f1 → child f2 → grandchild f3 → no further children
    mockFindMany
      .mockResolvedValueOnce([{ id: "f2" }] as never)
      .mockResolvedValueOnce([{ id: "f3" }] as never)
      .mockResolvedValueOnce([] as never);
    const res = await PATCH(patchReq("f1", { parentId: "f3" }), ctx("f1"));
    expect(res.status).toBe(400);
  });

  it("404 — target parent does not belong to user", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst
      .mockResolvedValueOnce({ id: "f1" } as never) // ownership of f1
      .mockResolvedValueOnce(null);                  // target parent lookup fails
    mockFindMany.mockResolvedValueOnce([] as never); // no descendants
    const res = await PATCH(patchReq("f1", { parentId: "fOther" }), ctx("f1"));
    expect(res.status).toBe(404);
  });

  it("409 — sibling-name collision returns friendly error", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce({ id: "f1" } as never); // ownership
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test",
    });
    mockUpdate.mockRejectedValueOnce(p2002);
    const res = await PATCH(patchReq("f1", { name: "Resumes" }), ctx("f1"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already exists/i);
  });

  it("200 — happy-path rename", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce({ id: "f1" } as never);
    mockUpdate.mockResolvedValueOnce({
      id: "f1",
      name: "Renamed",
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const res = await PATCH(patchReq("f1", { name: "Renamed" }), ctx("f1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Renamed");
  });

  it("200 — happy-path move to root (parentId: null)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce({ id: "f1" } as never);
    mockUpdate.mockResolvedValueOnce({
      id: "f1",
      name: "X",
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const res = await PATCH(patchReq("f1", { parentId: null }), ctx("f1"));
    expect(res.status).toBe(200);
    // descendant BFS should NOT have run for parentId=null (target is null)
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/document-folders/[id]", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await DELETE(deleteReq("f1"), ctx("f1"));
    expect(res.status).toBe(401);
  });

  it("404 — folder does not belong to user", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq("f1"), ctx("f1"));
    expect(res.status).toBe(404);
  });

  it("409 — non-empty folder without cascade returns counts", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce({
      id: "f1",
      _count: { children: 2, documents: 3 },
    } as never);
    const res = await DELETE(deleteReq("f1"), ctx("f1"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.children).toBe(2);
    expect(json.documents).toBe(3);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("200 — empty folder deletes without cascade flag", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce({
      id: "f1",
      _count: { children: 0, documents: 0 },
    } as never);
    mockDelete.mockResolvedValueOnce({ id: "f1" } as never);
    const res = await DELETE(deleteReq("f1"), ctx("f1"));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "f1" } });
  });

  it("200 — non-empty folder deletes when cascade=1", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce({
      id: "f1",
      _count: { children: 5, documents: 10 },
    } as never);
    mockDelete.mockResolvedValueOnce({ id: "f1" } as never);
    const res = await DELETE(deleteReq("f1", true), ctx("f1"));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "f1" } });
  });
});
