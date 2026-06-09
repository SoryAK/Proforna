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
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { proseMirrorDocToPlainText } from "@/lib/worklog/prosemirror-to-text";

type EntityType = "asset" | "skill" | "company" | "contact" | "worklog";
const VALID_TYPES = new Set<EntityType>(["asset", "skill", "company", "contact", "worklog"]);
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
        where: { id, userId },
        select: { id: true, contentJson: true, date: true },
      });
      return row
        ? { id: row.id, label: deriveWorklogLabel(row.contentJson, row.date) }
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

  switch (type) {
    case "asset": {
      const rows = await prisma.jobAsset.findMany({
        where: {
          userId,
          ...idExclusion,
          ...(term
            ? { name: { contains: term, mode: "insensitive" } }
            : {}),
        },
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
      const rows = await prisma.skillNode.findMany({
        where: {
          userId,
          ...idExclusion,
          ...(term
            ? { name: { contains: term, mode: "insensitive" } }
            : {}),
        },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        meta: r.type,
      }));
    }

    case "company": {
      // Return distinct company entries from WorkHistory (one row per unique company).
      const rows = await prisma.workHistory.findMany({
        where: {
          userId,
          ...idExclusion,
          ...(term
            ? { company: { contains: term, mode: "insensitive" } }
            : {}),
        },
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
      const rows = await prisma.contact.findMany({
        where: {
          userId,
          ...idExclusion,
          ...(term
            ? { name: { contains: term, mode: "insensitive" } }
            : {}),
        },
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
      // ADR-0016: search across the user's WorkLog notes by plain-text
      // content. Postgres `contains` on the `content` column (legacy plain
      // text) is good enough as a first-pass fuzzy match — the tsvector
      // search vector is overkill for an autocomplete picker.
      const rows = await prisma.workLog.findMany({
        where: {
          userId,
          ...idExclusion,
          ...(term
            ? { content: { contains: term, mode: "insensitive" } }
            : {}),
        },
        select: { id: true, contentJson: true, date: true },
        orderBy: { date: "desc" },
        take: MAX_RESULTS,
      });
      return rows.map((r) => ({
        id: r.id,
        label: deriveWorklogLabel(r.contentJson, r.date),
        meta: formatDateMeta(r.date),
      }));
    }
  }
}

// ── Worklog label derivation ─────────────────────────────────────────────

/**
 * Derive a label for a WorkLog mention candidate. WorkLog has no `title`
 * column — prefer the first non-empty plain-text line of `contentJson`,
 * fall back to the workday date.
 */
function deriveWorklogLabel(contentJson: unknown, date: Date): string {
  const text = proseMirrorDocToPlainText(contentJson).trim();
  if (text) {
    const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (firstLine) {
      // Truncate so chips don't blow out width.
      return firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine;
    }
  }
  return formatDateMeta(date);
}

function formatDateMeta(date: Date): string {
  return date.toISOString().slice(0, 10);
}
