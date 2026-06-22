/**
 * Hermetic coverage for the AI mention-search route introduced by ADR-0046
 * Phase C.
 *
 * Scope:
 *  - 401 when unauthenticated.
 *  - 400 for missing or invalid `type`.
 *  - Returns `{ id, type, label, secondary, score }[]` for each entity type.
 *  - Owner-scoped on every type (the `where: { userId }` filter is the
 *    contract — verified by mock call arguments).
 *  - Ranking honors `EntityAIMentionCount` rows: count DESC, then
 *    lastMentionedAt DESC, then alphabetical fall-through.
 *  - `limit` defaults to 8 and is capped at 20.
 *
 * Intentionally NOT covered here:
 *  - Underlying Prisma query shape beyond the owner-scope filter.
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
  workHistory: { findMany: vi.fn() },
  skillNode: { findMany: vi.fn() },
  workLog: { findMany: vi.fn() },
  contact: { findMany: vi.fn() },
  entityAIMentionCount: { findMany: vi.fn() },
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
  prismaMock.workHistory.findMany.mockResolvedValue([]);
  prismaMock.skillNode.findMany.mockResolvedValue([]);
  prismaMock.workLog.findMany.mockResolvedValue([]);
  prismaMock.contact.findMany.mockResolvedValue([]);
  prismaMock.entityAIMentionCount.findMany.mockResolvedValue([]);
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
    prismaMock.workHistory.findMany.mockResolvedValueOnce([
      { id: "wh1", company: "Acme Corp", title: "Senior Engineer" },
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
  });

  it("returns labeled skill rows (SkillNode) with type=`skill`", async () => {
    prismaMock.skillNode.findMany.mockResolvedValueOnce([
      { id: "sk1", name: "React", type: "technical" },
    ]);
    const res = await POST(makeRequest({ type: "skill", q: "rea" }));
    const body = (await res.json()) as MentionResult[];
    expect(body[0]).toMatchObject({
      id: "sk1",
      type: "skill",
      label: "React",
      secondary: "technical",
    });
  });

  it("returns labeled worklog rows (WorkLog kind=note) with type=`worklog`", async () => {
    const date = new Date("2026-06-20T00:00:00Z");
    prismaMock.workLog.findMany.mockResolvedValueOnce([
      { id: "wl1", title: "Quarterly Review Prep", date, contentJson: null },
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
  });

  it("returns labeled contact rows (Contact) with type=`contact`", async () => {
    prismaMock.contact.findMany.mockResolvedValueOnce([
      { id: "c1", name: "Jane Smith", role: "Recruiter", company: "Acme" },
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
  });

  // ── Owner-scoping (ADR-0028 pattern) ─────────────────────────────────────

  it("owner-scopes every per-type query with `where: { userId }`", async () => {
    for (const type of ["job", "skill", "worklog", "contact"] as const) {
      await POST(makeRequest({ type, q: "" }));
    }
    const tablesProbed = [
      prismaMock.workHistory.findMany,
      prismaMock.skillNode.findMany,
      prismaMock.workLog.findMany,
      prismaMock.contact.findMany,
    ];
    for (const tbl of tablesProbed) {
      expect(tbl).toHaveBeenCalled();
      const where = (tbl.mock.calls[0]?.[0] as { where?: { userId?: string } })
        ?.where;
      expect(where?.userId).toBe("test-user-id");
    }
  });

  // ── Ranking: EntityAIMentionCount count DESC, lastMentionedAt DESC, alpha ─

  it("ranks by EntityAIMentionCount count DESC when rows exist", async () => {
    prismaMock.skillNode.findMany.mockResolvedValueOnce([
      { id: "sk-low", name: "Alpha", type: "technical" },
      { id: "sk-high", name: "Beta", type: "technical" },
    ]);
    prismaMock.entityAIMentionCount.findMany.mockResolvedValueOnce([
      {
        userId: "test-user-id",
        entityType: "skill",
        entityId: "sk-high",
        count: 5,
        lastMentionedAt: new Date("2026-06-21"),
      },
      {
        userId: "test-user-id",
        entityType: "skill",
        entityId: "sk-low",
        count: 1,
        lastMentionedAt: new Date("2026-06-20"),
      },
    ]);
    const res = await POST(makeRequest({ type: "skill", q: "" }));
    const body = (await res.json()) as MentionResult[];
    expect(body.map((r) => r.id)).toEqual(["sk-high", "sk-low"]);
    expect(body[0].score).toBe(5);
    expect(body[1].score).toBe(1);
  });

  it("falls through to alphabetical when no mention-count rows exist", async () => {
    prismaMock.skillNode.findMany.mockResolvedValueOnce([
      { id: "sk-c", name: "Charlie", type: "technical" },
      { id: "sk-a", name: "Alpha", type: "technical" },
      { id: "sk-b", name: "Bravo", type: "technical" },
    ]);
    // entityAIMentionCount.findMany already mocked to []
    const res = await POST(makeRequest({ type: "skill", q: "" }));
    const body = (await res.json()) as MentionResult[];
    expect(body.map((r) => r.label)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(body.every((r) => r.score === 0)).toBe(true);
  });

  // ── Limit handling ──────────────────────────────────────────────────────

  it("defaults limit to 8 when none provided", async () => {
    await POST(makeRequest({ type: "skill", q: "" }));
    const args = prismaMock.skillNode.findMany.mock.calls[0]?.[0] as
      | { take?: number }
      | undefined;
    expect(args?.take).toBeGreaterThanOrEqual(8);
  });

  it("caps limit at 20 when client requests more", async () => {
    await POST(makeRequest({ type: "skill", q: "", limit: 1000 }));
    const args = prismaMock.skillNode.findMany.mock.calls[0]?.[0] as
      | { take?: number }
      | undefined;
    expect(args?.take).toBeLessThanOrEqual(20);
  });
});
