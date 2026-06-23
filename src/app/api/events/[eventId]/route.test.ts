/**
 * Tests for /api/events/[eventId] (ADR-0027 Day 2 Cycle B)
 *
 * Decisions enforced:
 *   - Q1=A: workHistoryId is IMMUTABLE on PATCH. Any body that includes a
 *           `workHistoryId` key (even matching the current value) is rejected
 *           with 400. Surfaces buggy clients rather than silently stripping.
 *   - Q2=B: this route family is STRICTLY for free-floating events. If the
 *           target event is anchored (workHistoryId !== null), respond 404
 *           — push the caller to /api/work-history/[id]/events/[eventId].
 *           Same 404 shape as "not owned" to avoid leaking existence.
 *   - Geo invariant: free-floating rows require lat + lng + location, so
 *           PATCHing any of them to explicit `null` is 400.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, DELETE } from "./route";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    careerEvent: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    careerEventSkill: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const USER_ID = "user-aaa";
const EVENT_ID = "evt-floating-1";

function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function deleteReq() {
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
    method: "DELETE",
  });
}
function ctx() {
  return { params: Promise.resolve({ eventId: EVENT_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── PATCH ────────────────────────────────────────────────────────

describe("PATCH /api/events/[eventId]", () => {
  it("401 when no session", async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const res = await PATCH(patchReq({ title: "x" }), ctx());
    expect(res.status).toBe(401);
  });

  it("404 when event belongs to another user (IDOR)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await PATCH(patchReq({ title: "x" }), ctx());
    expect(res.status).toBe(404);
    // Verify the where clause scopes to userId AND workHistoryId: null
    expect(prisma.careerEvent.findFirst).toHaveBeenCalledWith({
      where: { id: EVENT_ID, userId: USER_ID, workHistoryId: null },
    });
  });

  it("404 when event is anchored (Q2=B strict scope)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    // findFirst returns null because the WHERE clause includes workHistoryId: null
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await PATCH(patchReq({ title: "x" }), ctx());
    expect(res.status).toBe(404);
  });

  it("400 when body contains workHistoryId key (Q1=A immutability)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const res = await PATCH(
      patchReq({ workHistoryId: "wh-some-id", title: "x" }),
      ctx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/workHistoryId/i);
    expect(body.error).toMatch(/immutable|cannot/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("400 when body sets lat: null on floating event (geo invariant)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const res = await PATCH(patchReq({ lat: null }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lat/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("200 happy path — update title only", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const updatedRow = {
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
      title: "renamed",
      skills: [],
      photos: [],
    };
    // The route runs everything in a transaction; mock to invoke the callback
    // with a tx that proxies to the same mocked prisma client.
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        careerEvent: {
          update: vi.fn().mockResolvedValue(updatedRow),
          findUnique: vi.fn().mockResolvedValue(updatedRow),
        },
        careerEventSkill: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });
    const res = await PATCH(patchReq({ title: "renamed" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("renamed");
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("200 happy path — update geo trio + description + skills", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const updatedRow = {
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
      title: "kept",
      description: "new desc",
      lat: 47.6,
      lng: -122.3,
      location: "Seattle",
      skills: [],
      photos: [],
    };
    let txSkillDeleteCalls = 0;
    let txSkillCreateCalls = 0;
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        careerEvent: {
          update: vi.fn().mockResolvedValue(updatedRow),
          findUnique: vi.fn().mockResolvedValue(updatedRow),
        },
        careerEventSkill: {
          deleteMany: vi.fn().mockImplementation(async () => {
            txSkillDeleteCalls += 1;
            return { count: 0 };
          }),
          createMany: vi.fn().mockImplementation(async () => {
            txSkillCreateCalls += 1;
            return { count: 2 };
          }),
        },
      };
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });
    const res = await PATCH(
      patchReq({
        description: "new desc",
        lat: 47.6,
        lng: -122.3,
        location: "Seattle",
        skillNodeIds: ["sk-1", "sk-2"],
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.location).toBe("Seattle");
    expect(body.lat).toBe(47.6);
    // Skill replacement happened
    expect(txSkillDeleteCalls).toBe(1);
    expect(txSkillCreateCalls).toBe(1);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────

describe("DELETE /api/events/[eventId]", () => {
  it("401 when no session", async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const res = await DELETE(deleteReq(), ctx());
    expect(res.status).toBe(401);
  });

  it("404 when event belongs to another user", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await DELETE(deleteReq(), ctx());
    expect(res.status).toBe(404);
    expect(prisma.careerEvent.delete).not.toHaveBeenCalled();
  });

  it("404 when event is anchored (Q2=B strict scope)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    // findFirst returns null because the WHERE clause includes workHistoryId: null
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await DELETE(deleteReq(), ctx());
    expect(res.status).toBe(404);
    expect(prisma.careerEvent.findFirst).toHaveBeenCalledWith({
      where: { id: EVENT_ID, userId: USER_ID, workHistoryId: null },
    });
  });

  it("200 happy path", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    vi.mocked(prisma.careerEvent.delete).mockResolvedValue({
      id: EVENT_ID,
    } as never);
    const res = await DELETE(deleteReq(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(prisma.careerEvent.delete).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
    });
  });
});
