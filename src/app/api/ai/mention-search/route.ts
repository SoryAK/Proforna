/**
 * POST /api/ai/mention-search — ADR-0046 Phase C
 *
 * Entity search backend for the AI chat @-mention picker. Forked from
 * `/api/work-logs/mention-search` because the AI use case ranks by
 * "what does this user most often pull into AI context" (per-user
 * EntityAIMentionCount table), whereas the editor variant ranks by
 * recency-in-the-current-note + alphabetical.
 *
 * Request:  `{ type: "job"|"skill"|"worklog"|"contact", q?: string, limit?: number }`
 * Response: `{ id, type, label, secondary, score }[]` (up to `limit`, default 8, max 20)
 *
 * Ranking: count DESC, lastMentionedAt DESC, label ASC (alphabetical) for
 * tie-break. Default-zero ranks fall through to alphabetical — safe when
 * the EntityAIMentionCount table is empty.
 *
 * Owner-scoping (ADR-0028 pattern): every per-type query carries
 * `where: { userId }`. Cross-user entity IDs simply don't appear in the
 * result set; the route never reveals them.
 *
 * NOTE: v1 fetches alphabetically-first-N from the source table and
 * reorders in memory by rank. A high-rank entity that sorts alphabetically
 * outside the first-N is missed. This is acceptable for prefix searches
 * at v1 scales and can be improved post-Phase-D.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_TYPES = ["job", "skill", "worklog", "contact"] as const;
type MentionType = (typeof VALID_TYPES)[number];

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

interface MentionResult {
  id: string;
  type: MentionType;
  label: string;
  secondary: string;
  score: number;
}

interface Entity {
  id: string;
  label: string;
  secondary: string;
}

interface RankRow {
  count: number;
  lastMentionedAt: Date;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type?: string; q?: string; limit?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawType = body.type;
  if (!rawType || !VALID_TYPES.includes(rawType as MentionType)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const type = rawType as MentionType;
  const q = (body.q ?? "").trim();
  const limit = Math.min(
    Math.max(1, body.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  // 1) Source-table query — owner-scoped, alphabetically ordered so the
  //    fall-through tie-break has a stable basis even before we apply the
  //    mention-count rank in memory.
  const entities = await fetchEntities(type, q, userId, limit);
  if (entities.length === 0) return NextResponse.json([]);

  // 2) Mention-count rows for ranking.
  const ids = entities.map((e) => e.id);
  const countRows = await prisma.entityAIMentionCount.findMany({
    where: { userId, entityType: type, entityId: { in: ids } },
    select: { entityId: true, count: true, lastMentionedAt: true },
  });
  const rankMap = new Map<string, RankRow>();
  for (const row of countRows) {
    rankMap.set(row.entityId, {
      count: row.count,
      lastMentionedAt: row.lastMentionedAt,
    });
  }

  // 3) Compose the ranked list: count DESC, lastMentionedAt DESC, label ASC.
  const ZERO_RANK: RankRow = { count: 0, lastMentionedAt: new Date(0) };
  const sorted = entities
    .map((e) => ({ ...e, rank: rankMap.get(e.id) ?? ZERO_RANK }))
    .sort((a, b) => {
      if (b.rank.count !== a.rank.count) return b.rank.count - a.rank.count;
      const lt =
        b.rank.lastMentionedAt.getTime() - a.rank.lastMentionedAt.getTime();
      if (lt !== 0) return lt;
      return a.label.localeCompare(b.label);
    });

  const results: MentionResult[] = sorted.map((s) => ({
    id: s.id,
    type,
    label: s.label,
    secondary: s.secondary,
    score: s.rank.count,
  }));

  return NextResponse.json(results);
}

// ── Per-type fetchers ────────────────────────────────────────────────────

async function fetchEntities(
  type: MentionType,
  q: string,
  userId: string,
  take: number,
): Promise<Entity[]> {
  const contains = { contains: q, mode: "insensitive" as const };
  switch (type) {
    case "job": {
      const rows = await prisma.workHistory.findMany({
        where: q ? { userId, company: contains } : { userId },
        select: { id: true, company: true, title: true },
        orderBy: { company: "asc" },
        take,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.company,
        secondary: r.title ?? "",
      }));
    }
    case "skill": {
      const rows = await prisma.skillNode.findMany({
        where: q ? { userId, name: contains } : { userId },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
        take,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        secondary: r.type,
      }));
    }
    case "worklog": {
      const rows = await prisma.workLog.findMany({
        where: q
          ? { userId, kind: "note", title: contains }
          : { userId, kind: "note" },
        select: { id: true, title: true, date: true },
        orderBy: { title: "asc" },
        take,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.title,
        secondary: r.date.toISOString().slice(0, 10),
      }));
    }
    case "contact": {
      const rows = await prisma.contact.findMany({
        where: q ? { userId, name: contains } : { userId },
        select: { id: true, name: true, role: true, company: true },
        orderBy: { name: "asc" },
        take,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        secondary: r.role ?? r.company ?? "",
      }));
    }
  }
}
