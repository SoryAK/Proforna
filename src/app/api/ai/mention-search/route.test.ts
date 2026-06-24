/**
 * Hermetic coverage for the AI mention-search route introduced by ADR-0046
 * Phase C (now SQL-ranked, 2026-06-24).
 *
 * Scope:
 *  - 401 when unauthenticated.
 *  - 400 for missing or invalid `type`.
 *  - Returns `{ id, type, label, secondary, score }[]` for each entity type.
 *  - Owner-scoped on every type: the SQL fragment includes `userId` as a
 *    bound parameter on every per-type query (verified by inspecting the
 *    captured `Prisma.sql` template values).
 *  - Ranking honors `EntityAIMentionCount` rows via a SQL `LEFT JOIN` —
 *    `ORDER BY count DESC, lastMentionedAt DESC, label ASC`. Result-rank
 *    comes from the row's own `score` column.
 *  - `limit` defaults to 8 and is capped at 20 (asserted via the LIMIT
 *    parameter in the bound query).
 *
 * Intentionally NOT covered here:
 *  - Underlying SQL string equivalence (kept implementation-leaky on
 *    purpose — assertions target structural invariants instead).
 *  - Migration / DB state — that's a separate concern.
 *  - Pagination beyond `limit` (not in the v1 ADR contract).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

// `vi.mock` factories hoist; the prisma mock must live in `vi.hoisted()`
// so it's reachable when the route file is imported.
const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { getUserId } from "@/lib/auth-utils";
import { POST } from "./route";

interface MentionResult {
  id: string;
  type: string;
  label: string;
  secondary: string;
  score: number;
}

/**
 * Capture the last `Prisma.sql` template values passed to `$queryRaw`.
 * Prisma serialises the tagged template into a `Sql` instance whose
 * runtime shape includes a `values` array of bound parameters and a
 * `strings` array of the literal SQL chunks between them.
 */
function lastQueryRawValues(): unknown[] {
  const call = prismaMock.$queryRaw.mock.calls.at(-1) as unknown[] | undefined;
  const sql = call?.[0] as { values?: unknown[] } | undefined;
  return sql?.values ?? [];
}

function lastQueryRawSql(): string {
  const call = prismaMock.$queryRaw.mock.calls.at(-1) as unknown[] | undefined;
  const sql = call?.[0] as { strings?: readonly string[] } | undefined;
  return (sql?.strings ?? []).join(" ");
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/mention-search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getUserId as ReturnType<typeof vi.fn>).mockResolvedValue("test-user-id");
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe("POST /api/ai/mention-search — ADR-0046 Phase C", () => {
  // ── Auth + validation ────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    (getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ type: "job", q: "" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when `type` is missing", async () => {
    const res = await POST(makeRequest({ q: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when `type` is not in the allowed set", async () => {
    const res = await POST(makeRequest({ type: "asteroid", q: "" }));
    expect(res.status).toBe(400);
  });

  // ── Per-type search shape ────────────────────────────────────────────────

  it("returns labeled job rows (WorkHistory) with type=`job`", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "wh1",
        label: "Acme Corp",
        secondary: "Senior Engineer",
        score: 0,
      },
    ]);
    const res = await POST(makeRequest({ type: "job", q: "acme" }));
    const body = (await res.json()) as MentionResult[];
    expect(res.status).toBe(200);
    expect(body[0]).toMatchObject({
      id: "wh1",
      type: "job",
      label: "Acme Corp",
      secondary: "Senior Engineer",
    });
    expect(lastQueryRawSql()).toMatch(/FROM "WorkHistory"/);
  });

  it("returns labeled skill rows (SkillNode) with type=`skill`", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: "sk1", label: "React", secondary: "technical", score: 0 },
    ]);
    const res = await POST(makeRequest({ type: "skill", q: "rea" }));
    const body = (await res.json()) as MentionResult[];
    expect(body[0]).toMatchObject({
      id: "sk1",
      type: "skill",
      label: "React",
      secondary: "technical",
    });
    expect(lastQueryRawSql()).toMatch(/FROM "SkillNode"/);
  });

  it("returns labeled worklog rows (WorkLog kind=note) with type=`worklog`", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "wl1",
        label: "Quarterly Review Prep",
        secondary: "2026-06-20",
        score: 0,
      },
    ]);
    const res = await POST(makeRequest({ type: "worklog", q: "quarterly" }));
    const body = (await res.json()) as MentionResult[];
    expect(body[0]).toMatchObject({
      id: "wl1",
      type: "worklog",
      label: "Quarterly Review Prep",
    });
    // worklog secondary carries the date (ISO yyyy-mm-dd or similar)
    expect(body[0].secondary).toMatch(/2026-06-20/);
    const sql = lastQueryRawSql();
    expect(sql).toMatch(/FROM "WorkLog"/);
    // Kind discriminator must be wired so procedures don't leak in.
    expect(sql).toMatch(/kind = 'note'/);
  });

  it("returns labeled contact rows (Contact) with type=`contact`", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: "c1", label: "Jane Smith", secondary: "Recruiter", score: 0 },
    ]);
    const res = await POST(makeRequest({ type: "contact", q: "jane" }));
    const body = (await res.json()) as MentionResult[];
    expect(body[0]).toMatchObject({
      id: "c1",
      type: "contact",
      label: "Jane Smith",
    });
    // Either role or company is acceptable as secondary — assert non-empty.
    expect(body[0].secondary.length).toBeGreaterThan(0);
    expect(lastQueryRawSql()).toMatch(/FROM "Contact"/);
  });

  // ── Owner-scoping (ADR-0028 pattern) ─────────────────────────────────────

  it("owner-scopes every per-type query by binding userId as a SQL parameter", async () => {
    for (const type of ["job", "skill", "worklog", "contact"] as const) {
      prismaMock.$queryRaw.mockResolvedValueOnce([]);
      await POST(makeRequest({ type, q: "" }));
      const values = lastQueryRawValues();
      // userId appears as a bound parameter (twice: once in the LEFT JOIN's
      // count-table scope, once in the source-table WHERE clause).
      expect(values).toContain("test-user-id");
    }
  });

  // ── Ranking: SQL ORDER BY count DESC, lastMentionedAt DESC, label ASC ───

  it("ranks by SQL-side count DESC when the rank join returns counts", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: "sk-high", label: "Beta", secondary: "technical", score: 5 },
      { id: "sk-low", label: "Alpha", secondary: "technical", score: 1 },
    ]);
    const res = await POST(makeRequest({ type: "skill", q: "" }));
    const body = (await res.json()) as MentionResult[];
    expect(body.map((r) => r.id)).toEqual(["sk-high", "sk-low"]);
    expect(body[0].score).toBe(5);
    expect(body[1].score).toBe(1);
  });

  it("falls through to alphabetical when no mention-count rows exist", async () => {
    // SQL ORDER BY count DESC, lastMentionedAt DESC, label ASC handles this
    // server-side; the route surfaces whatever the DB returns. Postgres mock
    // here returns the rows already sorted by the SQL contract — the route
    // must NOT reorder them in JS.
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: "sk-a", label: "Alpha", secondary: "technical", score: 0 },
      { id: "sk-b", label: "Bravo", secondary: "technical", score: 0 },
      { id: "sk-c", label: "Charlie", secondary: "technical", score: 0 },
    ]);
    const res = await POST(makeRequest({ type: "skill", q: "" }));
    const body = (await res.json()) as MentionResult[];
    expect(body.map((r) => r.label)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(body.every((r) => r.score === 0)).toBe(true);
  });

  it("orders SQL by count DESC, lastMentionedAt DESC, then alphabetical", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await POST(makeRequest({ type: "skill", q: "" }));
    const sql = lastQueryRawSql();
    // Single ORDER BY clause; three sort keys in the documented order.
    expect(sql).toMatch(/ORDER BY COALESCE\(c\.count, 0\) DESC/);
    expect(sql).toMatch(/c\."lastMentionedAt" DESC/);
    // Final tie-break is on the canonical display column (label) ASC.
    expect(sql).toMatch(/ASC\s+LIMIT/);
  });

  // ── Limit handling (bound as a SQL parameter) ───────────────────────────

  it("defaults limit to 8 when none provided", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await POST(makeRequest({ type: "skill", q: "" }));
    const values = lastQueryRawValues();
    // limit is the last bound parameter (`LIMIT ${take}`).
    expect(values.at(-1)).toBe(8);
  });

  it("caps limit at 20 when client requests more", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await POST(makeRequest({ type: "skill", q: "", limit: 1000 }));
    const values = lastQueryRawValues();
    expect(values.at(-1)).toBe(20);
  });

  // ── Search-term binding (injection safety) ──────────────────────────────

  it("binds the search term as a wildcard SQL parameter (no string interpolation)", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await POST(makeRequest({ type: "skill", q: "react' OR 1=1 --" }));
    const values = lastQueryRawValues();
    expect(values).toContain("%react' OR 1=1 --%");
    // The literal user input must NOT appear unwrapped in the SQL string —
    // it always rides as a bound parameter.
    expect(lastQueryRawSql()).not.toContain("react' OR 1=1");
  });
});
