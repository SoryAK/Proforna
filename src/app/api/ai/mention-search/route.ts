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
 * Ranking: SQL-side `LEFT JOIN` against EntityAIMentionCount with
 * `ORDER BY count DESC, lastMentionedAt DESC, label ASC`.
 * Default-zero ranks fall through to alphabetical — safe when the
 * EntityAIMentionCount table is empty.
 *
 * Owner-scoping (ADR-0028 pattern): every per-type query carries
 * `where: { userId }`. Cross-user entity IDs simply don't appear in the
 * result set; the route never reveals them.
 *
 * This avoids the old v1 limitation where an alphabetical pre-cut could
 * exclude high-rank entities before ranking was applied.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

type RankedRow = {
  id: string;
  label: string;
  secondary: string;
  score: number;
};

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

  // SQL-side rank join (post-v1): limit is applied AFTER count/recency rank,
  // so high-rank entities are no longer missed by an alphabetical pre-cut.
  const rows = await fetchRankedEntities(type, q, userId, limit);
  const results: MentionResult[] = rows.map((row) => ({
    id: row.id,
    type,
    label: row.label,
    secondary: row.secondary,
    score: row.score,
  }));

  return NextResponse.json(results);
}

// ── Per-type ranked SQL queries ──────────────────────────────────────────

async function fetchRankedEntities(
  type: MentionType,
  q: string,
  userId: string,
  take: number,
): Promise<RankedRow[]> {
  const term = q.trim();
  const wildcard = `%${term}%`;

  switch (type) {
    case "job": {
      const whereFilter = term
        ? Prisma.sql`AND lower(w.company) LIKE lower(${wildcard})`
        : Prisma.empty;
      return prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT
          w.id,
          w.company AS label,
          COALESCE(w.title, '') AS secondary,
          COALESCE(c.count, 0)::int AS score
        FROM "WorkHistory" w
        LEFT JOIN "EntityAIMentionCount" c
          ON c."userId" = ${userId}
          AND c."entityType" = 'job'
          AND c."entityId" = w.id
        WHERE w."userId" = ${userId}
        ${whereFilter}
        ORDER BY COALESCE(c.count, 0) DESC, c."lastMentionedAt" DESC NULLS LAST, w.company ASC
        LIMIT ${take}
      `);
    }
    case "skill": {
      const whereFilter = term
        ? Prisma.sql`AND lower(s.name) LIKE lower(${wildcard})`
        : Prisma.empty;
      return prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT
          s.id,
          s.name AS label,
          COALESCE(s.type, '') AS secondary,
          COALESCE(c.count, 0)::int AS score
        FROM "SkillNode" s
        LEFT JOIN "EntityAIMentionCount" c
          ON c."userId" = ${userId}
          AND c."entityType" = 'skill'
          AND c."entityId" = s.id
        WHERE s."userId" = ${userId}
        ${whereFilter}
        ORDER BY COALESCE(c.count, 0) DESC, c."lastMentionedAt" DESC NULLS LAST, s.name ASC
        LIMIT ${take}
      `);
    }
    case "worklog": {
      const whereFilter = term
        ? Prisma.sql`AND lower(w.title) LIKE lower(${wildcard})`
        : Prisma.empty;
      return prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT
          w.id,
          COALESCE(w.title, '') AS label,
          to_char(w.date, 'YYYY-MM-DD') AS secondary,
          COALESCE(c.count, 0)::int AS score
        FROM "WorkLog" w
        LEFT JOIN "EntityAIMentionCount" c
          ON c."userId" = ${userId}
          AND c."entityType" = 'worklog'
          AND c."entityId" = w.id
        WHERE w."userId" = ${userId}
          AND w.kind = 'note'
        ${whereFilter}
        ORDER BY COALESCE(c.count, 0) DESC, c."lastMentionedAt" DESC NULLS LAST, w.title ASC
        LIMIT ${take}
      `);
    }
    case "contact": {
      const whereFilter = term
        ? Prisma.sql`AND lower(cn.name) LIKE lower(${wildcard})`
        : Prisma.empty;
      return prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT
          cn.id,
          cn.name AS label,
          COALESCE(cn.role, cn.company, '') AS secondary,
          COALESCE(c.count, 0)::int AS score
        FROM "Contact" cn
        LEFT JOIN "EntityAIMentionCount" c
          ON c."userId" = ${userId}
          AND c."entityType" = 'contact'
          AND c."entityId" = cn.id
        WHERE cn."userId" = ${userId}
        ${whereFilter}
        ORDER BY COALESCE(c.count, 0) DESC, c."lastMentionedAt" DESC NULLS LAST, cn.name ASC
        LIMIT ${take}
      `);
    }
  }
}
