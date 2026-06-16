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
import { GET, POST } from "@/app/api/work-logs/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findMany: vi.fn(),
      create:   vi.fn(),
    },
    workHistory:      { findFirst: vi.fn() },
    workHistoryShift: { findFirst: vi.fn() },
    workLogTemplate:  { findFirst: vi.fn(), update: vi.fn() },
    workLogFolder:    { findFirst: vi.fn() },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockFindMany  = vi.mocked(prisma.workLog.findMany);
const mockCreate    = vi.mocked(prisma.workLog.create);

function makeRequest(qs = ""): Request {
  return new Request(`http://localhost/api/work-logs${qs ? `?${qs}` : ""}`);
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/work-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUserId.mockResolvedValue("u1");
  mockFindMany.mockResolvedValue([] as any);
  mockCreate.mockResolvedValue({ id: "new1" } as any);
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

/**
 * ADR-0029 — kind discriminator filter.
 *
 * Locked contract:
 *   absent           → kind = "note"          (default — list page hides procedures)
 *   ?kind=procedure  → kind = "procedure"     (procedures list page)
 *
 * The kind filter is independent from `archived`, and composes with every
 * other filter on the route.
 */
describe("GET /api/work-logs — ADR-0029 kind filter", () => {
  it("default (no kind param) — only returns notes (kind='note')", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.kind).toBe("note");
  });

  it("kind=procedure — returns only procedures (kind='procedure')", async () => {
    const res = await GET(makeRequest("kind=procedure"));
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.kind).toBe("procedure");
  });
});

/**
 * ADR-0029 — POST accepts kind='procedure'.
 *
 * The CTA on /worklog/procedures POSTs `{ kind: 'procedure', ... }` and the
 * row must materialize on that page. The route must persist the kind on
 * create. Default behavior (no kind in body) still creates a note.
 */
describe("POST /api/work-logs — ADR-0029 kind acceptance", () => {
  it("persists kind='procedure' when body includes kind: 'procedure'", async () => {
    const res = await POST(makePostRequest({
      title: "Lock-out tag-out",
      date: "2026-06-15T08:00:00.000Z",
      kind: "procedure",
    }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const data = mockCreate.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data.kind).toBe("procedure");
  });

  it("defaults to kind='note' when body omits kind", async () => {
    const res = await POST(makePostRequest({
      title: "Routine note",
      date: "2026-06-15T08:00:00.000Z",
    }));
    expect(res.status).toBe(201);
    const data = mockCreate.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data.kind).toBe("note");
  });

  it("rejects an unknown kind value with 400 (no silent coerce)", async () => {
    // Audit-pattern parity (ADR-0029 P0-#3 follow-up): the original ship
    // silently coerced unknown values to 'note'. Silent coercion masks
    // client bugs and contradicts the explicit-validation pattern Unit 3
    // set up for PUT. The whitelist is now { 'note', 'procedure' } and
    // anything else returns 400 with a discoverable error message.
    const res = await POST(makePostRequest({
      title: "Bad kind",
      date: "2026-06-15T08:00:00.000Z",
      kind: "something-else",
    }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/kind/i);
    // Must short-circuit before any DB write.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts the explicit 'note' kind (parity with default-omitted)", async () => {
    // Defense-in-depth: the whitelist accepts BOTH valid values, not just
    // the non-default one. This guards against a future refactor that
    // inadvertently rejects 'note' as "redundant" — clients should be
    // free to send the canonical kind explicitly.
    const res = await POST(makePostRequest({
      title: "Explicit note",
      date: "2026-06-15T08:00:00.000Z",
      kind: "note",
    }));
    expect(res.status).toBe(201);
    const data = mockCreate.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data.kind).toBe("note");
  });
});
