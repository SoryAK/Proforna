/**
 * GET /api/work-logs/mention-search
 *
 * Serves entity search and existence checks for inline @mention nodes.
 *
 * Search mode:   ?type=asset|skill|company|contact|worklog&q=QUERY&excludeId=ID?
 *   Returns up to 8 matching entities: [{ id, label, meta? }]
 *   `excludeId` is honored for every type — cheap, prevents self-suggestion
 *   for note-to-note links per ADR-0016.
 *
 * Existence mode: ?type=...&id=ENTITY_ID
 *   Returns [{ id, label }] if found, [] if not (used for broken-chip check).
 *
 * All queries are scoped to the authenticated user's userId.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { deriveWorklogLabel } from "@/lib/worklog/derive-worklog-label";
import { buildRankedOrderBy } from "@/lib/mention-search/build-ranked-query";

type EntityType = "asset" | "skill" | "company" | "contact" | "worklog" | "procedure";
const VALID_TYPES = new Set<EntityType>(["asset", "skill", "company", "contact", "worklog", "procedure"]);
const MAX_RESULTS = 8;

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type");
  const q = searchParams.get("q") ?? "";
  const existenceId = searchParams.get("id");
  const excludeId = searchParams.get("excludeId");

  if (!rawType || !VALID_TYPES.has(rawType as EntityType)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const type = rawType as EntityType;

  // ── Existence check (id param) ──────────────────────────────────────────
  if (existenceId) {
    const result = await findById(type, existenceId, userId);
    return NextResponse.json(result ? [result] : []);
  }

  // ── Search (q param) ────────────────────────────────────────────────────
  const results = await searchEntities(type, q, userId, excludeId);
  return NextResponse.json(results);
}

// ── Per-type queries ─────────────────────────────────────────────────────────

async function findById(
  type: EntityType,
  id: string,
  userId: string,
): Promise<{ id: string; label: string } | null> {
  switch (type) {
    case "asset": {
      const row = await prisma.jobAsset.findFirst({
        where: { id, userId },
        select: { id: true, name: true },
      });
      return row ? { id: row.id, label: row.name } : null;
    }
    case "skill": {
      const row = await prisma.skillNode.findFirst({
        where: { id, userId },
        select: { id: true, name: true },
      });
      return row ? { id: row.id, label: row.name } : null;
    }
    case "company": {
      // Company entities are WorkHistory rows; the "id" is the WorkHistory id.
      const row = await prisma.workHistory.findFirst({
        where: { id, userId },
        select: { id: true, company: true },
      });
      return row ? { id: row.id, label: row.company } : null;
    }
    case "contact": {
      const row = await prisma.contact.findFirst({
        where: { id, userId },
        select: { id: true, name: true },
      });
      return row ? { id: row.id, label: row.name } : null;
    }
    case "worklog": {
      const row = await prisma.workLog.findFirst({
        where: { id, userId, kind: "note" },
        select: { id: true, title: true, contentJson: true, date: true },
      });
      return row
        ? {
            id: row.id,
            label: deriveWorklogLabel({
              title: row.title,
              contentJson: row.contentJson,
              date: row.date,
            }),
          }
        : null;
    }
    case "procedure": {
      // ADR-0029 — procedures are WorkLog rows with kind='procedure'. Scope
      // findFirst to the kind discriminator so a note id can never resolve
      // as a procedure even if the client tampers with the URL.
      const row = await prisma.workLog.findFirst({
        where: { id, userId, kind: "procedure" },
        select: { id: true, title: true, contentJson: true, date: true },
      });
      return row
        ? {
            id: row.id,
            label: deriveWorklogLabel({
              title: row.title,
              contentJson: row.contentJson,
              date: row.date,
            }),
          }
        : null;
    }
  }
}

async function searchEntities(
  type: EntityType,
  q: string,
  userId: string,
  excludeId: string | null,
): Promise<Array<{ id: string; label: string; meta?: string }>> {
  const term = q.trim();
  const idExclusion = excludeId ? { id: { not: excludeId } } : {};
  // Option C — when `term` is non-empty, we route each case to a ranked
  // $queryRaw (exact > prefix > substring) so the picker order matches
  // the user's typing intent. Empty `term` keeps the existing browse-mode
  // findMany (alpha or date-desc — no ranking needed).
  const wildcard = term ? `%${term}%` : "";
  const exclusionSql = excludeId ? Prisma.sql`AND id <> ${excludeId}` : Prisma.empty;

  switch (type) {
    case "asset": {
      if (term) {
        // Widened WHERE — match canonical name OR identifier OR
        // customerName (camelCase column requires quoting in raw SQL).
        // Ranking remains tier-0/1 on `name` only; the secondary fields
        // can only earn tier-2 via the wildcard substring.
        const rows = await prisma.$queryRaw<
          Array<{ id: string; name: string; identifier: string | null; customerName: string | null }>
        >(Prisma.sql`SELECT id, name, identifier, "customerName" FROM "JobAsset" WHERE "userId" = ${userId} ${exclusionSql} AND (lower(name) LIKE lower(${wildcard}) OR lower(identifier) LIKE lower(${wildcard}) OR lower("customerName") LIKE lower(${wildcard})) ${buildRankedOrderBy({ field: "name", term, secondary: Prisma.sql`name ASC`, take: MAX_RESULTS })}`);
        return rows.map((r) => ({
          id: r.id,
          label: r.name,
          meta: r.identifier ?? r.customerName ?? undefined,
        }));
      }
      const rows = await prisma.jobAsset.findMany({
        where: { userId, ...idExclusion },
        select: { id: true, name: true, identifier: true, customerName: true },
        orderBy: { name: "asc" },
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        meta: r.identifier ?? r.customerName ?? undefined,
      }));
    }

    case "skill": {
      if (term) {
        const rows = await prisma.$queryRaw<
          Array<{ id: string; name: string; type: string }>
        >(Prisma.sql`SELECT id, name, type FROM "SkillNode" WHERE "userId" = ${userId} ${exclusionSql} AND lower(name) LIKE lower(${wildcard}) ${buildRankedOrderBy({ field: "name", term, secondary: Prisma.sql`name ASC`, take: MAX_RESULTS })}`);
        return rows.map((r) => ({ id: r.id, label: r.name, meta: r.type }));
      }
      const rows = await prisma.skillNode.findMany({
        where: { userId, ...idExclusion },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({ id: r.id, label: r.name, meta: r.type }));
    }

    case "company": {
      // Distinct company entries from WorkHistory (one row per unique
      // company). Postgres DISTINCT ON requires the partition column
      // to lead ORDER BY, which conflicts with rank-first ordering.
      // Instead we over-fetch ranked rows and de-duplicate in JS — the
      // dataset is small (a user's WorkHistory rows, usually <30).
      if (term) {
        const rows = await prisma.$queryRaw<
          Array<{ id: string; company: string; title: string | null }>
        >(Prisma.sql`SELECT id, company, title FROM "WorkHistory" WHERE "userId" = ${userId} ${exclusionSql} AND lower(company) LIKE lower(${wildcard}) ${buildRankedOrderBy({ field: "company", term, secondary: Prisma.sql`company ASC`, take: MAX_RESULTS * 4 })}`);
        const seen = new Set<string>();
        const distinct: typeof rows = [];
        for (const r of rows) {
          if (seen.has(r.company)) continue;
          seen.add(r.company);
          distinct.push(r);
          if (distinct.length >= MAX_RESULTS) break;
        }
        return distinct.map((r) => ({
          id: r.id,
          label: r.company,
          meta: r.title ?? undefined,
        }));
      }
      const rows = await prisma.workHistory.findMany({
        where: { userId, ...idExclusion },
        select: { id: true, company: true, title: true },
        orderBy: { company: "asc" },
        distinct: ["company"],
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.company,
        meta: r.title ?? undefined,
      }));
    }

    case "contact": {
      if (term) {
        // Widened WHERE — match name OR role OR company. Tier-0/1 stay
        // on `name` only.
        const rows = await prisma.$queryRaw<
          Array<{ id: string; name: string; role: string | null; company: string | null }>
        >(Prisma.sql`SELECT id, name, role, company FROM "Contact" WHERE "userId" = ${userId} ${exclusionSql} AND (lower(name) LIKE lower(${wildcard}) OR lower(role) LIKE lower(${wildcard}) OR lower(company) LIKE lower(${wildcard})) ${buildRankedOrderBy({ field: "name", term, secondary: Prisma.sql`name ASC`, take: MAX_RESULTS })}`);
        return rows.map((r) => ({
          id: r.id,
          label: r.name,
          meta: [r.role, r.company].filter(Boolean).join(" · ") || undefined,
        }));
      }
      const rows = await prisma.contact.findMany({
        where: { userId, ...idExclusion },
        select: { id: true, name: true, role: true, company: true },
        orderBy: { name: "asc" },
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        meta: [r.role, r.company].filter(Boolean).join(" · ") || undefined,
      }));
    }

    case "worklog": {
      // ADR-0016 + Option C — search by `title OR content`. Ranking
      // tier-0/1 stays on `title` only; content matches always land in
      // tier-2 (random body text shouldn't beat a real title match).
      // ADR-0029 — scope to kind='note'.
      if (term) {
        const rows = await prisma.$queryRaw<
          Array<{ id: string; title: string | null; contentJson: unknown; date: Date }>
        >(Prisma.sql`SELECT id, title, "contentJson", date FROM "WorkLog" WHERE "userId" = ${userId} AND kind = 'note' ${exclusionSql} AND (lower(title) LIKE lower(${wildcard}) OR lower(content) LIKE lower(${wildcard})) ${buildRankedOrderBy({ field: `COALESCE(title, '')`, term, secondary: Prisma.sql`date DESC`, take: MAX_RESULTS })}`);
        return rows.map((r) => ({
          id: r.id,
          label: deriveWorklogLabel({
            title: r.title,
            contentJson: r.contentJson as Parameters<typeof deriveWorklogLabel>[0]["contentJson"],
            date: r.date,
          }),
          meta: formatDateMeta(r.date),
        }));
      }
      const rows = await prisma.workLog.findMany({
        where: { userId, kind: "note", ...idExclusion },
        select: { id: true, title: true, contentJson: true, date: true },
        orderBy: { date: "desc" },
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({
        id: r.id,
        label: deriveWorklogLabel({
          title: r.title,
          contentJson: r.contentJson,
          date: r.date,
        }),
        meta: formatDateMeta(r.date),
      }));
    }

    case "procedure": {
      // ADR-0029 — procedure picker. Same shape as worklog but kind='procedure'.
      if (term) {
        const rows = await prisma.$queryRaw<
          Array<{ id: string; title: string | null; contentJson: unknown; date: Date }>
        >(Prisma.sql`SELECT id, title, "contentJson", date FROM "WorkLog" WHERE "userId" = ${userId} AND kind = 'procedure' ${exclusionSql} AND (lower(title) LIKE lower(${wildcard}) OR lower(content) LIKE lower(${wildcard})) ${buildRankedOrderBy({ field: `COALESCE(title, '')`, term, secondary: Prisma.sql`date DESC`, take: MAX_RESULTS })}`);
        return rows.map((r) => ({
          id: r.id,
          label: deriveWorklogLabel({
            title: r.title,
            contentJson: r.contentJson as Parameters<typeof deriveWorklogLabel>[0]["contentJson"],
            date: r.date,
          }),
          meta: formatDateMeta(r.date),
        }));
      }
      const rows = await prisma.workLog.findMany({
        where: { userId, kind: "procedure", ...idExclusion },
        select: { id: true, title: true, contentJson: true, date: true },
        orderBy: { date: "desc" },
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({
        id: r.id,
        label: deriveWorklogLabel({
          title: r.title,
          contentJson: r.contentJson,
          date: r.date,
        }),
        meta: formatDateMeta(r.date),
      }));
    }
  }
}

// ── Worklog meta formatting ──────────────────────────────────────────────

function formatDateMeta(date: Date): string {
  return date.toISOString().slice(0, 10);
}
