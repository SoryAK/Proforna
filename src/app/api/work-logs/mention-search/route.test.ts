/**
 * Tests for GET /api/work-logs/mention-search
 *
 * Auth: getUserId mock
 * DB:   prisma.jobAsset, skillNode, workHistory, contact mocked
 *
 * Coverage: 401, 400 (missing/invalid type), asset search, asset existence
 *           check (found + not found), skill/company/contact search, meta
 *           formatting edge cases.
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/mention-search/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobAsset:    { findFirst: vi.fn(), findMany: vi.fn() },
    skillNode:   { findFirst: vi.fn(), findMany: vi.fn() },
    workHistory: { findFirst: vi.fn(), findMany: vi.fn() },
    contact:     { findFirst: vi.fn(), findMany: vi.fn() },
    workLog:     { findFirst: vi.fn(), findMany: vi.fn() },
    $queryRaw:   vi.fn(),
  },
}));

const mockGetUserId = vi.mocked(getUserId);

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/work-logs/mention-search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
describe("GET /api/work-logs/mention-search", () => {

  // ── auth ──────────────────────────────────────────────

  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await GET(makeRequest({ type: "asset", q: "pump" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  // ── type validation ───────────────────────────────────

  it("400 — missing type parameter", async () => {
    mockGetUserId.mockResolvedValue("u1");

    const res = await GET(makeRequest({ q: "pump" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid type");
  });

  it("400 — invalid type value returns Invalid type", async () => {
    mockGetUserId.mockResolvedValue("u1");

    const res = await GET(makeRequest({ type: "equipment", q: "pump" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid type");
  });

  // ── asset search ──────────────────────────────────────

  it("returns asset results with id, label, and meta (identifier preferred over customerName)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "a1", name: "Pump A", identifier: "P-001", customerName: null },
      { id: "a2", name: "Pump B", identifier: null, customerName: "Acme"  },
    ] as any);

    const res = await GET(makeRequest({ type: "asset", q: "pump" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({ id: "a1", label: "Pump A", meta: "P-001" });
    expect(json[1]).toMatchObject({ id: "a2", label: "Pump B", meta: "Acme" });
  });

  it("returns asset results without meta when both identifier and customerName are null", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "a3", name: "Motor C", identifier: null, customerName: null },
    ] as any);

    const res = await GET(makeRequest({ type: "asset", q: "motor" }));
    const json = await res.json();

    expect(json[0].meta).toBeUndefined();
  });

  // ── asset existence check ─────────────────────────────

  it("returns [{ id, label }] for an asset existence check when found", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.jobAsset.findFirst).mockResolvedValue(
      { id: "a1", name: "Pump A" } as any,
    );

    const res = await GET(makeRequest({ type: "asset", id: "a1" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ id: "a1", label: "Pump A" });
  });

  it("returns [] for an asset existence check when not found", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.jobAsset.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest({ type: "asset", id: "missing-id" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // ── skill search ──────────────────────────────────────

  it("returns skill results with skill type as meta", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "s1", name: "React", type: "technical" },
    ] as any);

    const res = await GET(makeRequest({ type: "skill", q: "react" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "s1", label: "React", meta: "technical" });
  });

  it("returns [] for skill existence check when not found", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.skillNode.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest({ type: "skill", id: "no-such-skill" }));

    expect(await res.json()).toEqual([]);
  });

  // ── company search ────────────────────────────────────

  it("returns company results derived from workHistory rows", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "wh1", company: "Acme Corp", title: "Engineer" },
    ] as any);

    const res = await GET(makeRequest({ type: "company", q: "acme" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "wh1", label: "Acme Corp", meta: "Engineer" });
  });

  it("omits meta when workHistory title is null", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "wh2", company: "Beta Inc", title: null },
    ] as any);

    const res = await GET(makeRequest({ type: "company", q: "beta" }));
    const json = await res.json();

    expect(json[0].meta).toBeUndefined();
  });

  // ── contact search ────────────────────────────────────

  it("returns contact results with 'role · company' as meta", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "co1", name: "Jane Doe", role: "Manager", company: "Acme Corp" },
    ] as any);

    const res = await GET(makeRequest({ type: "contact", q: "jane" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "co1", label: "Jane Doe", meta: "Manager · Acme Corp" });
  });

  it("uses only non-null parts for contact meta", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "co2", name: "John", role: null, company: "Beta Inc" },
    ] as any);

    const res = await GET(makeRequest({ type: "contact", q: "john" }));
    const json = await res.json();

    expect(json[0].meta).toBe("Beta Inc");
  });

  it("omits meta entirely when contact has no role or company", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "co3", name: "Ghost", role: null, company: null },
    ] as any);

    const res = await GET(makeRequest({ type: "contact", q: "ghost" }));
    const json = await res.json();

    expect(json[0].meta).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────
// ADR-0016 — worklog branch + excludeId
// ──────────────────────────────────────────────────────

/**
 * Build a minimal ProseMirror doc whose first paragraph contains a single
 * text run — used by the worklog label-derivation logic.
 */
function docWithFirstLine(text: string) {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text }] },
    ],
  };
}

describe("GET /api/work-logs/mention-search — worklog branch (ADR-0016)", () => {
  it("returns worklog results with label preferring WorkLog.title over content", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        id: "log-1",
        title: "Pump repair playbook",
        contentJson: docWithFirstLine("Today's pump repair notes"),
        date: new Date("2026-06-09T12:00:00Z"),
      },
      {
        id: "log-2",
        title: "",
        contentJson: docWithFirstLine("Body fallback line"),
        date: new Date("2026-06-08T12:00:00Z"),
      },
      {
        id: "log-3",
        title: null,
        contentJson: { type: "doc", content: [{ type: "paragraph" }] },
        date: new Date("2026-06-07T12:00:00Z"),
      },
    ] as any);

    const res = await GET(makeRequest({ type: "worklog", q: "pump" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(3);
    expect(json[0]).toMatchObject({ id: "log-1", label: "Pump repair playbook" });
    expect(json[1]).toMatchObject({ id: "log-2", label: "Body fallback line" });
    // Empty title + empty body → fallback to a non-empty date label.
    expect(json[2].id).toBe("log-3");
    expect(typeof json[2].label).toBe("string");
    expect(json[2].label.length).toBeGreaterThan(0);
  });

  it("selects the title column from the database (not just contentJson + date)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "worklog", q: "foo" }));

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0];
    const sql = call?.[0] as unknown as { strings: string[] };
    const sqlText = sql.strings.join("?");
    expect(sqlText).toMatch(/\btitle\b/);
  });

  it("searches against title OR content (case-insensitive contains)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "worklog", q: "packer" }));

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0];
    const sql = call?.[0] as unknown as { strings: string[]; values: unknown[] };
    const sqlText = sql.strings.join("?").toLowerCase();
    // Both columns must appear with lower(...) LIKE, indicating case-insensitive contains.
    expect(sqlText).toMatch(/lower\(title\)\s+like/);
    expect(sqlText).toMatch(/lower\(content\)\s+like/);
    // The term must be bound as a wildcard value ("%packer%"), not inlined.
    expect(sql.values.some((v) => v === "%packer%")).toBe(true);
    expect(sql.values.some((v) => v === "u1")).toBe(true);
  });

  it("omits the OR clause entirely when search term is empty", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "worklog", q: "" }));

    const call = vi.mocked(prisma.workLog.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.OR).toBeUndefined();
  });

  it("existence check (id param) returns the worklog with title-derived label", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findFirst).mockResolvedValue({
      id: "log-1",
      title: "Crusher #3 motor issue",
      contentJson: docWithFirstLine("Body content here"),
      date: new Date("2026-06-09T12:00:00Z"),
    } as any);

    const res = await GET(makeRequest({ type: "worklog", id: "log-1" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ id: "log-1", label: "Crusher #3 motor issue" });
  });

  it("existence check returns empty array when worklog is missing or cross-user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest({ type: "worklog", id: "missing" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("honors excludeId on worklog search (filters self-suggestion)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "worklog", q: "foo", excludeId: "log-self" }));

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0];
    const sql = call?.[0] as unknown as { strings: string[]; values: unknown[] };
    // userId is bound and excludeId appears as a bound parameter.
    expect(sql.values.some((v) => v === "u1")).toBe(true);
    expect(sql.values.some((v) => v === "log-self")).toBe(true);
  });

  it("honors excludeId on asset search (cheap, defense-in-depth)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "asset", q: "pump", excludeId: "asset-self" }));

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0];
    const sql = call?.[0] as unknown as { values: unknown[] };
    expect(sql.values.some((v) => v === "asset-self")).toBe(true);
  });
});

// ──────────────────────────────────────────────────────
// ADR-0029 — procedure branch (kind discriminator filter)
// ──────────────────────────────────────────────────────

describe("GET /api/work-logs/mention-search — procedure branch (ADR-0029)", () => {
  it("filters workLog.findMany to kind='procedure' so notes are never suggested as runbooks", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "procedure", q: "lockout" }));

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0];
    const sql = call?.[0] as unknown as { strings: string[]; values: unknown[] };
    const sqlText = sql.strings.join("?").toLowerCase();
    // The kind filter is the headline contract — without it /worklog/notes
    // rows leak into the @r: picker.
    expect(sqlText).toContain("kind = 'procedure'");
    // Search clause still composes — title OR content contains.
    expect(sqlText).toMatch(/lower\(title\)\s+like/);
    expect(sqlText).toMatch(/lower\(content\)\s+like/);
    expect(sql.values.some((v) => v === "u1")).toBe(true);
    expect(sql.values.some((v) => v === "%lockout%")).toBe(true);
  });

  it("returns procedure rows with WorkLog.title-derived label (same shape as worklog branch)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        id: "proc-1",
        title: "Lock-out tag-out",
        contentJson: docWithFirstLine("Step 1: de-energize"),
        date: new Date("2026-06-15T08:00:00Z"),
      },
    ] as any);

    const res = await GET(makeRequest({ type: "procedure", q: "lock" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ id: "proc-1", label: "Lock-out tag-out" });
  });

  it("existence check (id param) finds the procedure and returns title-derived label", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workLog.findFirst).mockResolvedValue({
      id: "proc-1",
      title: "Crusher startup checklist",
      contentJson: docWithFirstLine("Body"),
      date: new Date("2026-06-15T08:00:00Z"),
    } as any);

    const res = await GET(makeRequest({ type: "procedure", id: "proc-1" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ id: "proc-1", label: "Crusher startup checklist" });
    // findFirst should also scope kind='procedure' so a note id can never
    // resolve as a procedure (defense-in-depth against url tampering).
    const call = vi.mocked(prisma.workLog.findFirst).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.kind).toBe("procedure");
  });
});

// ──────────────────────────────────────────────────────
// Option C — SQL relevance ranking
// ──────────────────────────────────────────────────────
//
// When the user types a query term, the route must rank results so
// exact matches outrank prefix matches outrank substring matches.
// Implementation lives in prisma.$queryRaw with a CASE-based ORDER BY.
// These specs assert the ROUTE contract — that $queryRaw is used for
// non-empty terms, findMany for empty terms, and the response shape
// matches the existing label/meta projection.
//
// The ranking SEMANTICS themselves are verified by
// build-ranked-query.test.ts (SQL shape) + trusted to postgres at run
// time.

describe("GET /api/work-logs/mention-search — Option C: SQL ranking", () => {
  it("uses $queryRaw (not findMany) when the search term is non-empty (asset)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "a1", name: "Pump A", identifier: "P-001", customerName: null },
    ] as any);

    await GET(makeRequest({ type: "asset", q: "pump" }));

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.jobAsset.findMany).not.toHaveBeenCalled();
  });

  it("still uses findMany when the search term is empty (asset browse mode)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.jobAsset.findMany).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "asset", q: "" }));

    expect(prisma.jobAsset.findMany).toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("uses $queryRaw for skill search with non-empty term", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "s-react", name: "React", type: "technical" },
    ] as any);

    const res = await GET(makeRequest({ type: "skill", q: "re" }));

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.skillNode.findMany).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "s-react", label: "React", meta: "technical" });
  });

  it("uses $queryRaw for company search with non-empty term", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "wh-acme", company: "Acme Corp", title: "Engineer" },
    ] as any);

    const res = await GET(makeRequest({ type: "company", q: "acme" }));

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.workHistory.findMany).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "wh-acme", label: "Acme Corp", meta: "Engineer" });
  });

  it("uses $queryRaw for contact search with non-empty term and preserves role · company meta", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "co1", name: "Jane Doe", role: "Manager", company: "Acme Corp" },
    ] as any);

    const res = await GET(makeRequest({ type: "contact", q: "jane" }));

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "co1", label: "Jane Doe", meta: "Manager · Acme Corp" });
  });

  it("uses $queryRaw for worklog search with non-empty term and preserves title-derived label", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        id: "log-1",
        title: "Pump repair playbook",
        contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }] },
        date: new Date("2026-06-09T12:00:00Z"),
      },
    ] as any);

    const res = await GET(makeRequest({ type: "worklog", q: "pump" }));

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.workLog.findMany).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "log-1", label: "Pump repair playbook" });
  });

  it("uses $queryRaw for procedure search with non-empty term", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        id: "proc-1",
        title: "Lockout tagout",
        contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }] },
        date: new Date("2026-06-15T08:00:00Z"),
      },
    ] as any);

    const res = await GET(makeRequest({ type: "procedure", q: "lock" }));

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.workLog.findMany).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "proc-1", label: "Lockout tagout" });
  });

  // ── cross-user isolation under raw SQL ─────────────────────────────────
  //
  // The route uses prisma.$queryRaw(Prisma.sql`…`) — i.e. function-call
  // form. mock.calls[0] is therefore `[sqlObject]` where sqlObject has
  // `.strings` (template fragments) and `.values` (parameter binds).

  function getSql(): { strings: string[]; values: unknown[] } {
    const call = vi.mocked(prisma.$queryRaw).mock.calls[0];
    const sql = call?.[0] as unknown as { strings: string[]; values: unknown[] };
    return { strings: sql?.strings ?? [], values: sql?.values ?? [] };
  }

  it("$queryRaw call binds the authenticated userId (asset)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "asset", q: "pump" }));

    const { values } = getSql();
    expect(values.some((v) => v === "u1")).toBe(true);
  });

  it("$queryRaw call binds excludeId when provided (worklog)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "worklog", q: "foo", excludeId: "log-self" }));

    const { values } = getSql();
    expect(values.some((v) => v === "log-self")).toBe(true);
  });

  // ── injection defence ──────────────────────────────────────────────────

  it("dangerous query terms are parameter-bound, not inlined into raw SQL", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    const payload = "x'); DROP TABLE \"Contact\";--";
    await GET(makeRequest({ type: "contact", q: payload }));

    const { strings, values } = getSql();
    const templateText = strings.join("?");
    expect(templateText).not.toContain("DROP TABLE");
    // Payload appears wrapped in `%...%` (wildcard) in the bind values.
    expect(
      values.some((v) => typeof v === "string" && v.includes("DROP TABLE")),
    ).toBe(true);
  });

  // ── widening — contact (role + company) and asset (identifier + customerName) ──

  it("contact WHERE widens to role and company in the raw SQL template", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "contact", q: "acme" }));

    const { strings } = getSql();
    const templateText = strings.join(" ").toLowerCase();
    expect(templateText).toContain("name");
    expect(templateText).toContain("role");
    expect(templateText).toContain("company");
  });

  it("asset WHERE widens to identifier and customerName in the raw SQL template", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    await GET(makeRequest({ type: "asset", q: "p-001" }));

    const { strings } = getSql();
    const templateText = strings.join(" ");
    expect(templateText).toMatch(/name/);
    expect(templateText).toMatch(/identifier/i);
    expect(templateText).toMatch(/customerName|"customerName"/i);
  });
});

