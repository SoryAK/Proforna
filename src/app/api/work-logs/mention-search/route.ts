/**
 * GET /api/work-logs/mention-search
 *
 * Serves entity search and existence checks for inline @mention nodes.
 *
 * Search mode:   ?type=asset|skill|company|contact&q=QUERY
 *   Returns up to 8 matching entities: [{ id, label, meta? }]
 *
 * Existence mode: ?type=asset|skill|company|contact&id=ENTITY_ID
 *   Returns [{ id, label }] if found, [] if not (used for broken-chip check).
 *
 * All queries are scoped to the authenticated user's userId.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

type EntityType = "asset" | "skill" | "company" | "contact";
const VALID_TYPES = new Set<EntityType>(["asset", "skill", "company", "contact"]);
const MAX_RESULTS = 8;

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawType = searchParams.get("type");
  const q = searchParams.get("q") ?? "";
  const existenceId = searchParams.get("id");

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
  const results = await searchEntities(type, q, userId);
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
  }
}

async function searchEntities(
  type: EntityType,
  q: string,
  userId: string,
): Promise<Array<{ id: string; label: string; meta?: string }>> {
  const term = q.trim();

  switch (type) {
    case "asset": {
      const rows = await prisma.jobAsset.findMany({
        where: {
          userId,
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
  }
}
