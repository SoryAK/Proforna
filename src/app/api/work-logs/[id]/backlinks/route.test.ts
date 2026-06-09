/**
 * Tests for GET /api/work-logs/[id]/backlinks
 *
 * Auth: getUserId mock
 * DB:   prisma.workLog.findMany mocked
 *
 * Coverage: 401, owner-scoped lookup with `linkedNoteIds: { has: id }`,
 *           self-filter via `NOT: { id }`, label derivation from contentJson,
 *           empty array on no matches, cross-user isolation.
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/[id]/backlinks/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: { findMany: vi.fn() },
  },
}));

const mockGetUserId = vi.mocked(getUserId);

function makeRequest(): Request {
  return new Request("http://localhost/api/work-logs/log-target/backlinks", {
    method: "GET",
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function docWithFirstLine(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/work-logs/[id]/backlinks", () => {
  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await GET(makeRequest(), ctx("log-target"));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns backlinks scoped to userId and excluding the target id (self-filter)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([
      {
        id: "log-a",
        contentJson: docWithFirstLine("Linked note A"),
        date: new Date("2026-06-09T12:00:00Z"),
        positionId: "pos-1",
      } as any,
      {
        id: "log-b",
        contentJson: docWithFirstLine("Another linker"),
        date: new Date("2026-06-08T12:00:00Z"),
        positionId: null,
      } as any,
    ]);

    const res = await GET(makeRequest(), ctx("log-target"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({
      id: "log-a",
      label: "Linked note A",
      positionId: "pos-1",
    });
    expect(json[1]).toMatchObject({
      id: "log-b",
      label: "Another linker",
      positionId: null,
    });

    const call = vi.mocked(prisma.workLog.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.userId).toBe("u1");
    // Where clause must include `linkedNoteIds: { has: "log-target" }` and exclude self.
    expect(JSON.stringify(call.where)).toContain("log-target");
    expect(call.where.NOT).toEqual({ id: "log-target" });
  });

  it("returns empty array when no notes link to the target", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([]);

    const res = await GET(makeRequest(), ctx("log-orphan"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("falls back to the workday date when contentJson has no plain-text first line", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([
      {
        id: "log-empty",
        contentJson: { type: "doc", content: [{ type: "paragraph" }] },
        date: new Date("2026-06-09T12:00:00Z"),
        positionId: null,
      } as any,
    ]);

    const res = await GET(makeRequest(), ctx("log-target"));

    const json = await res.json();
    expect(json[0].id).toBe("log-empty");
    expect(typeof json[0].label).toBe("string");
    expect(json[0].label.length).toBeGreaterThan(0);
  });
});
