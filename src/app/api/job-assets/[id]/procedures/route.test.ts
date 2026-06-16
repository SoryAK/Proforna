/**
 * Tests for GET /api/job-assets/[id]/procedures (ADR-0029 Unit 8)
 *
 * Cross-cut backlinks recipe (per docs/workflows/wire-mention-entity-type.md
 * step 8 cross-cut variant). Returns the list of WorkLog entries with
 * `kind = 'procedure'` whose `assetIds` array contains the target asset id.
 *
 * Owner-scoped twice-over: (1) the asset id MUST belong to the signed-in
 * user — otherwise 404, never proceed to the WorkLog query — and (2) the
 * WorkLog scan is filtered by the same `userId`.
 *
 * Coverage: 401 unauthenticated, 404 cross-user, happy-path with kind +
 * assetIds compound filter, empty array, label fallback (title → body).
 */

import { vi } from "vitest";
import { GET } from "@/app/api/job-assets/[id]/procedures/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobAsset: { findFirst: vi.fn() },
    workLog:  { findMany: vi.fn() },
  },
}));

const mockGetUserId      = vi.mocked(getUserId);
const mockAssetFindFirst = vi.mocked(prisma.jobAsset.findFirst);
const mockFindMany       = vi.mocked(prisma.workLog.findMany);

function makeRequest(): Request {
  return new Request("http://localhost/api/job-assets/asset-1/procedures", {
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

describe("GET /api/job-assets/[id]/procedures", () => {
  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await GET(makeRequest(), ctx("asset-1"));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
    // Must short-circuit before any DB query.
    expect(mockAssetFindFirst).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("404 — asset id does not belong to the signed-in user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockAssetFindFirst.mockResolvedValue(null);

    const res = await GET(makeRequest(), ctx("asset-other-user"));

    expect(res.status).toBe(404);
    // Must verify ownership — owner scope passed to findFirst.
    const call = mockAssetFindFirst.mock.calls[0]?.[0] as {
      where: { id: string; userId: string };
    };
    expect(call.where).toEqual({ id: "asset-other-user", userId: "u1" });
    // Must NOT proceed to the worklog query when the asset is not theirs.
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns owner-scoped procedures filtered by kind + assetIds", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockAssetFindFirst.mockResolvedValue({ id: "asset-1", userId: "u1" } as any);
    mockFindMany.mockResolvedValue([
      {
        id: "proc-a",
        title: "Lock-out tag-out",
        contentJson: docWithFirstLine("Step 1: de-energize"),
        date: new Date("2026-06-15T12:00:00Z"),
        positionId: "pos-1",
      } as any,
    ]);

    const res = await GET(makeRequest(), ctx("asset-1"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({
      id: "proc-a",
      label: "Lock-out tag-out",
      positionId: "pos-1",
    });

    // The where clause must compose userId + kind="procedure" + assetIds:has.
    const call = mockFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.userId).toBe("u1");
    expect(call.where.kind).toBe("procedure");
    expect(call.where.assetIds).toEqual({ has: "asset-1" });
  });

  it("returns an empty array when the asset has no procedures linked", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockAssetFindFirst.mockResolvedValue({ id: "asset-1", userId: "u1" } as any);
    mockFindMany.mockResolvedValue([] as any);

    const res = await GET(makeRequest(), ctx("asset-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("derives label from body when title is empty (canonical fallback chain)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockAssetFindFirst.mockResolvedValue({ id: "asset-1", userId: "u1" } as any);
    mockFindMany.mockResolvedValue([
      {
        id: "proc-b",
        title: "",
        contentJson: docWithFirstLine("First step is to verify lockout"),
        date: new Date("2026-06-10T12:00:00Z"),
        positionId: null,
      } as any,
    ]);

    const res = await GET(makeRequest(), ctx("asset-1"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({
      id: "proc-b",
      label: "First step is to verify lockout",
      positionId: null,
    });
  });
});
