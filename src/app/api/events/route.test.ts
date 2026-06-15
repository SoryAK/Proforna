/**
 * Integration tests for /api/events POST + GET handlers.
 *
 * Peer route family for FREE-FLOATING career events (ADR-0027 Day 2 Cycle A).
 * Distinct from `/api/work-history/[id]/events` which is for events anchored
 * to a specific work history.
 *
 * Decisions (per ADR-0027 Day 2 Q&A):
 *   - Q2=B (strict): this route ONLY creates/lists free-floating events.
 *     POST forces `workHistoryId: null` regardless of body content
 *     (defense-in-depth, mirrors anchored POST forcing URL `id`).
 *   - Q3=A (filterable GET): default returns ALL user's events (anchored +
 *     free-floating); `?floating=true` narrows to free-floating only;
 *     `?floating=false` narrows to anchored only.
 *
 * Auth:  getUserId mocked
 * DB:    prisma.careerEvent.create + prisma.careerEvent.findMany mocked
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/events/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    careerEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockEventCreate = vi.mocked(prisma.careerEvent.create);
const mockEventFindMany = vi.mocked(prisma.careerEvent.findMany);

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(search?: string): Request {
  const url = `http://localhost/api/events${search ? `?${search}` : ""}`;
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/events (free-floating)", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(postReq({ title: "x" }) as never);
    expect(res.status).toBe(401);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("400 — missing title returns validator error", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(
      postReq({ description: "no title here" }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/title/i);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("400 — free-floating without lat is rejected (cross-field rule)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(
      postReq({
        title: "Conference talk",
        lng: -122.3321,
        location: "Seattle",
      }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/lat/i);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("400 — free-floating without lng is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(
      postReq({
        title: "Conference talk",
        lat: 47.6062,
        location: "Seattle",
      }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/lng/i);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("400 — free-floating without location is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(
      postReq({
        title: "Conference talk",
        lat: 47.6062,
        lng: -122.3321,
      }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/location/i);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("201 — happy path: full geo trio, workHistoryId forced null", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockEventCreate.mockResolvedValueOnce({
      id: "ev1",
      userId: "user1",
      workHistoryId: null,
      title: "Conference talk",
    } as never);

    const res = await POST(
      postReq({
        title: "  Conference talk  ", // gets trimmed
        description: "  notes  ", // gets trimmed
        category: "conference",
        startDate: "2026-06-15",
        location: "Seattle",
        lat: 47.6062,
        lng: -122.3321,
      }) as never,
    );

    expect(res.status).toBe(201);
    expect(mockEventCreate).toHaveBeenCalledTimes(1);
    const arg = mockEventCreate.mock.calls[0][0]!;
    const data = arg.data as Record<string, unknown>;

    expect(data.workHistoryId).toBeNull();
    expect(data.userId).toBe("user1");
    expect(data.title).toBe("Conference talk");
    expect(data.description).toBe("notes");
    expect(data.category).toBe("conference");
    expect(data.location).toBe("Seattle");
    expect(data.lat).toBe(47.6062);
    expect(data.lng).toBe(-122.3321);
    expect(data.startDate).toBeInstanceOf(Date);
  });

  it("201 — body-supplied workHistoryId is IGNORED (route forces null)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockEventCreate.mockResolvedValueOnce({
      id: "ev2",
      userId: "user1",
      workHistoryId: null,
      title: "Field day",
    } as never);

    const res = await POST(
      postReq({
        // Even if a caller smuggles a workHistoryId, the peer route forces null.
        workHistoryId: "wh-attacker-tries-to-anchor",
        title: "Field day",
        location: "Park HQ",
        lat: 40.7128,
        lng: -74.006,
      }) as never,
    );

    expect(res.status).toBe(201);
    const arg = mockEventCreate.mock.calls[0][0]!;
    const data = arg.data as Record<string, unknown>;
    expect(data.workHistoryId).toBeNull();
  });
});

describe("GET /api/events", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await GET(getReq() as never);
    expect(res.status).toBe(401);
    expect(mockEventFindMany).not.toHaveBeenCalled();
  });

  it("200 — default returns all user's events (anchored + free-floating)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockEventFindMany.mockResolvedValueOnce([
      { id: "ev1", userId: "user1", workHistoryId: "wh1", title: "Anchored" },
      { id: "ev2", userId: "user1", workHistoryId: null, title: "Floating" },
    ] as never);

    const res = await GET(getReq() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);

    // Filter scopes to current user (IDOR safety) and applies no workHistoryId filter
    const arg = mockEventFindMany.mock.calls[0][0]!;
    const where = arg.where as Record<string, unknown>;
    expect(where.userId).toBe("user1");
    expect(where).not.toHaveProperty("workHistoryId");
  });

  it("200 — ?floating=true narrows to free-floating events only", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockEventFindMany.mockResolvedValueOnce([
      { id: "ev2", userId: "user1", workHistoryId: null, title: "Floating" },
    ] as never);

    const res = await GET(getReq("floating=true") as never);
    expect(res.status).toBe(200);

    const arg = mockEventFindMany.mock.calls[0][0]!;
    const where = arg.where as Record<string, unknown>;
    expect(where.userId).toBe("user1");
    expect(where.workHistoryId).toBeNull();
  });

  it("200 — ?floating=false narrows to anchored events only", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockEventFindMany.mockResolvedValueOnce([
      { id: "ev1", userId: "user1", workHistoryId: "wh1", title: "Anchored" },
    ] as never);

    const res = await GET(getReq("floating=false") as never);
    expect(res.status).toBe(200);

    const arg = mockEventFindMany.mock.calls[0][0]!;
    const where = arg.where as Record<string, unknown>;
    expect(where.userId).toBe("user1");
    // Anchored: workHistoryId is NOT null
    expect(where.workHistoryId).toEqual({ not: null });
  });
});
