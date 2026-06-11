/**
 * Tests for GET /api/work-logs — ADR-0026 archive bucket filter.
 *
 * Scope (per implementation discipline): only the new `archived` query
 * parameter behavior added by ADR-0026 is tested here. The pre-existing
 * filters (positionId, from/to, category, accomplishments, notable,
 * templateId, equipmentId, assetId, folderId) are out of scope for this
 * change.
 *
 * Locked contract:
 *   ?archived=only → only archivedAt IS NOT NULL
 *   ?archived=all  → both buckets (no archivedAt predicate added)
 *   absent / other → archivedAt IS NULL (Gmail-style default hide)
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findMany: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockFindMany  = vi.mocked(prisma.workLog.findMany);

function makeRequest(qs = ""): Request {
  return new Request(`http://localhost/api/work-logs${qs ? `?${qs}` : ""}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUserId.mockResolvedValue("u1");
  mockFindMany.mockResolvedValue([] as any);
});

describe("GET /api/work-logs — ADR-0026 archive filter", () => {
  it("default (no archived param) — hides archived rows", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.userId).toBe("u1");
    expect(where.archivedAt).toBeNull();
  });

  it("archived=only — returns ONLY archived rows", async () => {
    const res = await GET(makeRequest("archived=only"));
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.archivedAt).toEqual({ not: null });
  });

  it("archived=all — returns both archived and non-archived (no predicate added)", async () => {
    const res = await GET(makeRequest("archived=all"));
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).not.toHaveProperty("archivedAt");
  });

  it("unknown archived value — falls back to default (hide archived)", async () => {
    const res = await GET(makeRequest("archived=banana"));
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.archivedAt).toBeNull();
  });

  it("archive filter composes with other filters (folderId + archived=only)", async () => {
    const res = await GET(makeRequest("folderId=f1&archived=only"));
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.folderId).toBe("f1");
    expect(where.archivedAt).toEqual({ not: null });
  });
});
