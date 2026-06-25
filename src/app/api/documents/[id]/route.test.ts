/**
 * Integration tests for /api/documents/[id] (GET only).
 *
 * Coverage (ADR-0051 sprint α' commit 1):
 *   - 401 unauthenticated
 *   - 404 cross-user IDOR
 *   - GET legacy row (data populated, filePath null) — backward compat lock-in
 *   - GET disk-backed row (data null, filePath set) — ADR-0051 new behavior
 *
 * PATCH and DELETE are out of scope for this commit; they keep their
 * pre-existing (currently untested) behavior and will get coverage in a
 * follow-up patch as the substrate matures.
 *
 * Auth: getUserId mocked
 * DB:   prisma.document mocks (Schema-Faithful Mocks rule — fields mirror schema)
 * FS:   disk-backed test writes a real tmp file then cleans up
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

import { GET } from "@/app/api/documents/[id]/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn(),
}));

const mockGetUserId = vi.mocked(getUserId);
const mockFindFirst = vi.mocked(prisma.document.findFirst);

function getReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/documents/${id}`, { method: "GET" });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/documents/[id]", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await GET(getReq("d1"), ctx("d1"));
    expect(res.status).toBe(401);
  });

  it("404 — document does not belong to user (IDOR)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await GET(getReq("d1"), ctx("d1"));
    expect(res.status).toBe(404);
  });

  it("200 — legacy row (data populated, filePath null) downloads inline bytes", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const bytes = Buffer.from("hello legacy world", "utf-8");
    mockFindFirst.mockResolvedValueOnce({
      id: "d1",
      userId: "user1",
      fileName: "legacy.txt",
      mimeType: "text/plain",
      data: bytes.toString("base64"),
      filePath: null,
    } as never);

    const res = await GET(getReq("d1"), ctx("d1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(res.headers.get("Content-Disposition")).toContain("legacy.txt");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(bytes)).toBe(true);
  });

  it("200 — disk-backed row (data null, filePath set) downloads disk bytes", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const bytes = Buffer.from("hello disk world", "utf-8");
    const tmpPath = path.join(os.tmpdir(), `adr-0051-test-${Date.now()}.txt`);
    await fs.writeFile(tmpPath, bytes);

    try {
      mockFindFirst.mockResolvedValueOnce({
        id: "d2",
        userId: "user1",
        fileName: "disk.txt",
        mimeType: "text/plain",
        data: null,
        filePath: tmpPath,
      } as never);

      const res = await GET(getReq("d2"), ctx("d2"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/plain");
      expect(res.headers.get("Content-Disposition")).toContain("disk.txt");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.equals(bytes)).toBe(true);
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  });
});
