/**
 * Integration tests for /api/work-history/[id]/events POST handler.
 *
 * Drives the wire-up of `validateCareerEventInput` (ADR-0027) into the
 * anchored event creation route. Behaviors covered:
 *   - 401 — unauthenticated
 *   - 404 — IDOR (work history not owned by user)
 *   - 400 — missing title (validator regression)
 *   - 400 — non-finite lat (validator-only behavior; old inline check
 *           silently coerced bad numbers to null)
 *   - 400 — unparseable startDate (validator-only behavior; old inline
 *           code passed bad strings straight to `new Date(...)`)
 *   - 201 — happy path: URL-derived workHistoryId is authoritative
 *           (body's workHistoryId is ignored), validator normalizes
 *           description/metrics/location/dates before persistence.
 *
 * Auth:  getUserId mocked
 * DB:    prisma.workHistory.findFirst + prisma.careerEvent.create mocked
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/work-history/[id]/events/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workHistory: {
      findFirst: vi.fn(),
    },
    careerEvent: {
      create: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockWHFindFirst = vi.mocked(prisma.workHistory.findFirst);
const mockEventCreate = vi.mocked(prisma.careerEvent.create);

function postReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/work-history/${id}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/work-history/[id]/events", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(postReq("wh1", { title: "x" }) as never, ctx("wh1"));
    expect(res.status).toBe(401);
  });

  it("404 — work history not owned by user (IDOR)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockWHFindFirst.mockResolvedValueOnce(null);
    const res = await POST(
      postReq("wh1", { title: "x" }) as never,
      ctx("wh1"),
    );
    expect(res.status).toBe(404);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("400 — missing title returns validator error", async () => {
    mockGetUserId.mockResolvedValue("user1");
    // ownership check happens AFTER validation in the new wire-up
    const res = await POST(
      postReq("wh1", { description: "no title here" }) as never,
      ctx("wh1"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/title/i);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("400 — non-finite lat is rejected (was silently coerced before)", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(
      postReq("wh1", { title: "ok", lat: "not-a-number" }) as never,
      ctx("wh1"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/lat/i);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("400 — unparseable startDate is rejected", async () => {
    mockGetUserId.mockResolvedValue("user1");
    const res = await POST(
      postReq("wh1", { title: "ok", startDate: "not-a-date" }) as never,
      ctx("wh1"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/startdate/i);
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("201 — happy path: URL workHistoryId wins, validator normalizes payload", async () => {
    mockGetUserId.mockResolvedValue("user1");
    mockWHFindFirst.mockResolvedValueOnce({ id: "wh1", userId: "user1" } as never);
    mockEventCreate.mockResolvedValueOnce({
      id: "ev1",
      userId: "user1",
      workHistoryId: "wh1",
      title: "Migrated to Postgres",
    } as never);

    const res = await POST(
      postReq("wh1", {
        // Defense-in-depth: even if caller smuggles a different workHistoryId,
        // the URL param must win.
        workHistoryId: "wh-attacker",
        title: "  Migrated to Postgres  ", // gets trimmed
        description: "  notes  ", // gets trimmed
        category: "milestone",
        startDate: "2026-06-15",
        endDate: null,
        location: "  HQ  ",
        lat: 47.6062,
        lng: -122.3321,
        metrics: "+15% throughput",
      }) as never,
      ctx("wh1"),
    );

    expect(res.status).toBe(201);
    expect(mockEventCreate).toHaveBeenCalledTimes(1);
    const arg = mockEventCreate.mock.calls[0][0]!;
    const data = arg.data as Record<string, unknown>;

    // URL-derived workHistoryId is authoritative
    expect(data.workHistoryId).toBe("wh1");
    expect(data.userId).toBe("user1");

    // Validator-normalized fields
    expect(data.title).toBe("Migrated to Postgres");
    expect(data.description).toBe("notes");
    expect(data.category).toBe("milestone");
    expect(data.location).toBe("HQ");
    expect(data.lat).toBe(47.6062);
    expect(data.lng).toBe(-122.3321);
    expect(data.metrics).toBe("+15% throughput");
    expect(data.startDate).toBeInstanceOf(Date);
    expect(data.endDate).toBeNull();
  });
});
