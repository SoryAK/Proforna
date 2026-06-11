/**
 * Tests for GET /api/work-logs/search — ADR-0026 archive bucket filter.
 *
 * Same locked contract as GET /api/work-logs:
 *   ?archived=only → only archivedAt IS NOT NULL
 *   ?archived=all  → both buckets (no archivedAt predicate)
 *   absent / other → archivedAt IS NULL (Gmail-style default hide)
 *
 * Search uses $queryRaw + Prisma.sql tagged template, so we capture the
 * Sql object and assert against its compiled `.text` (the parameterized
 * SQL with $1, $2, … placeholders) and `.values` array.
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/search/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: { findMany: vi.fn() },
    workLogFolder: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockQueryRaw  = vi.mocked(prisma.$queryRaw);

function makeRequest(qs: string): Request {
  return new Request(`http://localhost/api/work-logs/search?${qs}`);
}

function lastSqlText(): string {
  // $queryRaw is called with a single Prisma.Sql object (template tag form).
  const sql = mockQueryRaw.mock.calls[0]![0] as { text: string };
  return sql.text;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUserId.mockResolvedValue("u1");
  mockQueryRaw.mockResolvedValue([] as any);
});

describe("GET /api/work-logs/search — ADR-0026 archive filter", () => {
  it("default (no archived param) — hides archived rows in the ranked CTE", async () => {
    const res = await GET(makeRequest("q=hello"));
    expect(res.status).toBe(200);
    const text = lastSqlText();
    expect(text).toContain(`"archivedAt" IS NULL`);
    expect(text).not.toContain(`"archivedAt" IS NOT NULL`);
  });

  it("archived=only — returns ONLY archived rows", async () => {
    const res = await GET(makeRequest("q=hello&archived=only"));
    expect(res.status).toBe(200);
    const text = lastSqlText();
    expect(text).toContain(`"archivedAt" IS NOT NULL`);
    expect(text).not.toContain(`"archivedAt" IS NULL`);
  });

  it("archived=all — does NOT add an archivedAt predicate", async () => {
    const res = await GET(makeRequest("q=hello&archived=all"));
    expect(res.status).toBe(200);
    const text = lastSqlText();
    expect(text).not.toContain(`"archivedAt"`);
  });

  it("unknown archived value — falls back to default (hide archived)", async () => {
    const res = await GET(makeRequest("q=hello&archived=banana"));
    expect(res.status).toBe(200);
    const text = lastSqlText();
    expect(text).toContain(`"archivedAt" IS NULL`);
  });

  it("composes with folder scope (unfiled + archived=only)", async () => {
    const res = await GET(makeRequest("q=hello&folderId=unfiled&archived=only"));
    expect(res.status).toBe(200);
    const text = lastSqlText();
    expect(text).toContain(`"folderId" IS NULL`);
    expect(text).toContain(`"archivedAt" IS NOT NULL`);
  });
});
