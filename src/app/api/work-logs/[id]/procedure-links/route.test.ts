/**
 * Tests for /api/work-logs/[id]/procedure-links — ADR-0030 Unit 8.
 *
 * GET   → returns { outgoing, incoming }, both arrays of links with the
 *         joined target procedure metadata (id, title, label).
 * POST  → creates a new ProcedureLink row from this procedure to another.
 *         Validates: relationship vocabulary, both endpoints are owned
 *         procedures, no self-link, returns 409 on duplicate composite
 *         (fromProcedureId, toProcedureId, relationship).
 *
 * Auth: getUserId mock
 * DB:   prisma mocks for workLog + procedureLink
 */

import { vi } from "vitest";
import { GET, POST } from "@/app/api/work-logs/[id]/procedure-links/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({ getUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: { findUnique: vi.fn(), findMany: vi.fn() },
    procedureLink: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeGet(id: string): Request {
  return new Request(`http://localhost/api/work-logs/${id}/procedure-links`, {
    method: "GET",
  });
}

function makePost(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/work-logs/${id}/procedure-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/work-logs/[id]/procedure-links", () => {
  it("401 when unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await GET(makeGet("p-1"), ctx("p-1"));
    expect(res.status).toBe(401);
  });

  it("404 when procedure does not exist or is not owned", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(null);
    const res = await GET(makeGet("p-1"), ctx("p-1"));
    expect(res.status).toBe(404);
  });

  it("404 when the row exists but is a note (kind='note'), not a procedure", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue({
      id: "p-1",
      userId: "u1",
      kind: "note",
    } as any);
    const res = await GET(makeGet("p-1"), ctx("p-1"));
    expect(res.status).toBe(404);
  });

  it("200 — returns { outgoing, incoming } with target metadata, both arrays empty by default", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue({
      id: "p-1",
      userId: "u1",
      kind: "procedure",
    } as any);
    vi.mocked(prisma.procedureLink.findMany).mockResolvedValue([] as never);

    const res = await GET(makeGet("p-1"), ctx("p-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ outgoing: [], incoming: [] });

    // Two findMany calls: one for outgoing (fromProcedureId = id), one for
    // incoming (toProcedureId = id).
    expect(vi.mocked(prisma.procedureLink.findMany)).toHaveBeenCalledTimes(2);
  });

  it("200 — surfaces outgoing + incoming links with derived label", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue({
      id: "p-1",
      userId: "u1",
      kind: "procedure",
    } as any);

    vi.mocked(prisma.procedureLink.findMany)
      .mockResolvedValueOnce([
        {
          id: "link-out-1",
          fromProcedureId: "p-1",
          toProcedureId: "p-2",
          relationship: "prereq",
          note: null,
          createdAt: new Date("2026-06-15T00:00:00Z"),
          toProcedure: {
            id: "p-2",
            title: "Lockout-tagout",
            contentJson: null,
            date: new Date("2026-06-10T00:00:00Z"),
          },
        } as any,
      ])
      .mockResolvedValueOnce([
        {
          id: "link-in-1",
          fromProcedureId: "p-3",
          toProcedureId: "p-1",
          relationship: "next",
          note: "after replace",
          createdAt: new Date("2026-06-14T00:00:00Z"),
          fromProcedure: {
            id: "p-3",
            title: "Replace fuse",
            contentJson: null,
            date: new Date("2026-06-09T00:00:00Z"),
          },
        } as any,
      ]);

    const res = await GET(makeGet("p-1"), ctx("p-1"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.outgoing).toHaveLength(1);
    expect(json.outgoing[0]).toMatchObject({
      id: "link-out-1",
      relationship: "prereq",
      note: null,
      target: { id: "p-2", label: "Lockout-tagout" },
    });

    expect(json.incoming).toHaveLength(1);
    expect(json.incoming[0]).toMatchObject({
      id: "link-in-1",
      relationship: "next",
      note: "after replace",
      target: { id: "p-3", label: "Replace fuse" },
    });
  });
});

describe("POST /api/work-logs/[id]/procedure-links", () => {
  it("401 when unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(
      makePost("p-1", { toProcedureId: "p-2", relationship: "prereq" }),
      ctx("p-1"),
    );
    expect(res.status).toBe(401);
  });

  it("400 when body is missing fields", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makePost("p-1", { toProcedureId: "p-2" }), ctx("p-1"));
    expect(res.status).toBe(400);
  });

  it("400 when relationship is outside the locked vocabulary", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(
      makePost("p-1", { toProcedureId: "p-2", relationship: "blocks" }),
      ctx("p-1"),
    );
    expect(res.status).toBe(400);
  });

  it("400 when fromProcedureId === toProcedureId (self-link forbidden)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(
      makePost("p-1", { toProcedureId: "p-1", relationship: "prereq" }),
      ctx("p-1"),
    );
    expect(res.status).toBe(400);
  });

  it("404 when source procedure is not owned by user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([] as never);
    const res = await POST(
      makePost("p-1", { toProcedureId: "p-2", relationship: "prereq" }),
      ctx("p-1"),
    );
    expect(res.status).toBe(404);
  });

  it("404 when target procedure is not owned by user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([
      { id: "p-1", userId: "u1", kind: "procedure" },
    ] as never);
    const res = await POST(
      makePost("p-1", { toProcedureId: "p-2", relationship: "prereq" }),
      ctx("p-1"),
    );
    expect(res.status).toBe(404);
  });

  it("400 when source row exists but kind != 'procedure'", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([
      { id: "p-1", userId: "u1", kind: "note" },
      { id: "p-2", userId: "u1", kind: "procedure" },
    ] as never);
    const res = await POST(
      makePost("p-1", { toProcedureId: "p-2", relationship: "prereq" }),
      ctx("p-1"),
    );
    expect(res.status).toBe(400);
  });

  it("201 — creates the link with relationship + note, returns the row", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([
      { id: "p-1", userId: "u1", kind: "procedure" },
      { id: "p-2", userId: "u1", kind: "procedure" },
    ] as never);
    vi.mocked(prisma.procedureLink.create).mockResolvedValue({
      id: "link-new",
      fromProcedureId: "p-1",
      toProcedureId: "p-2",
      relationship: "prereq",
      note: "if box is in a machine",
      createdAt: new Date("2026-06-15T00:00:00Z"),
    } as any);

    const res = await POST(
      makePost("p-1", {
        toProcedureId: "p-2",
        relationship: "prereq",
        note: "if box is in a machine",
      }),
      ctx("p-1"),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({
      id: "link-new",
      fromProcedureId: "p-1",
      toProcedureId: "p-2",
      relationship: "prereq",
      note: "if box is in a machine",
    });

    const call = vi.mocked(prisma.procedureLink.create).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).toMatchObject({
      fromProcedureId: "p-1",
      toProcedureId: "p-2",
      relationship: "prereq",
      note: "if box is in a machine",
    });
  });

  it("409 — duplicate composite (fromProcedureId, toProcedureId, relationship)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([
      { id: "p-1", userId: "u1", kind: "procedure" },
      { id: "p-2", userId: "u1", kind: "procedure" },
    ] as never);
    // P2002 = Prisma's unique constraint violation.
    const e: Error & { code?: string } = new Error("Unique constraint failed");
    e.code = "P2002";
    vi.mocked(prisma.procedureLink.create).mockRejectedValue(e);

    const res = await POST(
      makePost("p-1", { toProcedureId: "p-2", relationship: "prereq" }),
      ctx("p-1"),
    );
    expect(res.status).toBe(409);
  });
});
