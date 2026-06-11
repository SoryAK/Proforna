/**
 * Tests for POST /api/work-logs/bulk — ADR-0026 archive/unarchive actions.
 *
 * Scope (per implementation discipline): only the new actions added by
 * ADR-0026 are tested here. The pre-existing `move` and `delete` actions
 * are left covered by integration usage; this file does NOT retroactively
 * test them.
 *
 * Coverage:
 *  - action: "archive"   → workLog.updateMany sets archivedAt = Date (server clamp)
 *  - action: "unarchive" → workLog.updateMany sets archivedAt = null
 *  - userId predicate is always present in the WHERE clause
 *  - 401 when unauthenticated
 *  - 400 on invalid action / empty ids
 */

import { vi } from "vitest";
import { POST } from "@/app/api/work-logs/bulk/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    workLogFolder: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mockGetUserId    = vi.mocked(getUserId);
const mockUpdateMany   = vi.mocked(prisma.workLog.updateMany);
const mockTransaction  = vi.mocked(prisma.$transaction);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default $transaction passthrough — invoke callback with the mocked
  // prisma client so the route's tx.* calls land on our mocks.
  mockTransaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
});

describe("POST /api/work-logs/bulk — ADR-0026 archive/unarchive", () => {
  it("401 — unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(makeRequest({ action: "archive", ids: ["a"] }));
    expect(res.status).toBe(401);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("action: archive — sets archivedAt to a server-authoritative timestamp for owned ids", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockUpdateMany.mockResolvedValue({ count: 2 } as any);

    const before = Date.now();
    const res = await POST(makeRequest({ action: "archive", ids: ["a", "b"] }));
    const after = Date.now();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, affected: 2 });

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const arg = mockUpdateMany.mock.calls[0][0] as {
      where: { id: { in: string[] }; userId: string };
      data: { archivedAt: Date | null };
    };
    expect(arg.where).toEqual({ id: { in: ["a", "b"] }, userId: "u1" });
    expect(arg.data.archivedAt).toBeInstanceOf(Date);
    const ts = (arg.data.archivedAt as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("action: unarchive — clears archivedAt to null for owned ids", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockUpdateMany.mockResolvedValue({ count: 3 } as any);

    const res = await POST(makeRequest({ action: "unarchive", ids: ["a", "b", "c"] }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, affected: 3 });

    const arg = mockUpdateMany.mock.calls[0][0] as {
      where: { id: { in: string[] }; userId: string };
      data: { archivedAt: Date | null };
    };
    expect(arg.where).toEqual({ id: { in: ["a", "b", "c"] }, userId: "u1" });
    expect(arg.data.archivedAt).toBeNull();
  });

  it("400 — empty ids array is rejected", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ action: "archive", ids: [] }));
    expect(res.status).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("400 — unknown action is rejected", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ action: "incinerate", ids: ["a"] }));
    expect(res.status).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
