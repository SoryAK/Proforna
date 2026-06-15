/**
 * Tests for GET /api/contacts/[id]/backlinks (ADR-0028)
 *
 * Auth: getUserId mock
 * DB:   prisma.contact.findFirst + prisma.workLog.findMany mocked
 *
 * Coverage: 401 unauthenticated, 404 when contact doesn't belong to caller,
 *           owner-scoped lookup with `linkedContactIds: { has: id }`,
 *           label derivation from title (with contentJson fallback),
 *           empty array on no matches, cross-user isolation.
 */

import { vi } from "vitest";
import { GET } from "@/app/api/contacts/[id]/backlinks/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: { findFirst: vi.fn() },
    workLog: { findMany: vi.fn() },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockContactFindFirst = vi.mocked(prisma.contact.findFirst);
const mockFindMany = vi.mocked(prisma.workLog.findMany);

function makeRequest(): Request {
  return new Request("http://localhost/api/contacts/contact-1/backlinks", {
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

describe("GET /api/contacts/[id]/backlinks", () => {
  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await GET(makeRequest(), ctx("contact-1"));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    // Must short-circuit before any DB query.
    expect(mockContactFindFirst).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("404 — contact id does not belong to the signed-in user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockContactFindFirst.mockResolvedValue(null);

    const res = await GET(makeRequest(), ctx("contact-other-user"));

    expect(res.status).toBe(404);
    // Must verify ownership — owner scope passed to findFirst.
    const call = mockContactFindFirst.mock.calls[0]?.[0] as {
      where: { id: string; userId: string };
    };
    expect(call.where).toEqual({ id: "contact-other-user", userId: "u1" });
    // Must NOT proceed to the worklog query when the contact is not theirs.
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns owner-scoped backlinks ordered by date desc, label preferred from title", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockContactFindFirst.mockResolvedValue({ id: "contact-1", userId: "u1" } as any);
    mockFindMany.mockResolvedValue([
      {
        id: "log-a",
        title: "Tom intro call",
        contentJson: docWithFirstLine("First call notes"),
        date: new Date("2026-06-15T12:00:00Z"),
        positionId: "pos-1",
      } as any,
      {
        id: "log-b",
        title: "",
        contentJson: docWithFirstLine("Falls back to body"),
        date: new Date("2026-06-10T12:00:00Z"),
        positionId: null,
      } as any,
    ]);

    const res = await GET(makeRequest(), ctx("contact-1"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({
      id: "log-a",
      label: "Tom intro call",
      positionId: "pos-1",
    });
    expect(json[1]).toMatchObject({
      id: "log-b",
      label: "Falls back to body",
      positionId: null,
    });

    const call = mockFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy: Record<string, unknown>;
    };
    expect(call.where.userId).toBe("u1");
    expect(call.where.linkedContactIds).toEqual({ has: "contact-1" });
    // No NOT self-filter — contacts and worklogs are different entity types.
    expect(call.where).not.toHaveProperty("NOT");
    expect(call.select.title).toBe(true);
    expect(call.orderBy).toEqual({ date: "desc" });
  });

  it("returns empty array when no notes mention the contact", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockContactFindFirst.mockResolvedValue({ id: "contact-1", userId: "u1" } as any);
    mockFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest(), ctx("contact-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("falls back to the date when title is empty AND contentJson has no plain-text first line", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockContactFindFirst.mockResolvedValue({ id: "contact-1", userId: "u1" } as any);
    mockFindMany.mockResolvedValue([
      {
        id: "log-empty",
        title: "",
        contentJson: { type: "doc", content: [{ type: "paragraph" }] },
        date: new Date("2026-06-09T12:00:00Z"),
        positionId: null,
      } as any,
    ]);

    const res = await GET(makeRequest(), ctx("contact-1"));

    const json = await res.json();
    expect(json[0].id).toBe("log-empty");
    expect(typeof json[0].label).toBe("string");
    expect(json[0].label.length).toBeGreaterThan(0);
  });
});
