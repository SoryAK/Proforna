/**
 * POST /api/work-logs/reorder
 *
 * Bulk-reorder WorkLog notes within (and optionally across) folders.
 * Implements AD-1: dense integer sortOrder — callers must send all siblings
 * whose rank changes, not just the moved item.
 *
 * Body:
 *   { items: Array<{ id: string; sortOrder: number; folderId?: string | null }> }
 *
 * Security:
 *   • Authenticated via getUserId().
 *   • Single ownership precheck query — any unknown id returns 404 rather
 *     than silently skipping, preventing IDOR via crafted ids.
 *   • items clamped to MAX_ITEMS to prevent DoS.
 *   • Wrapped in $transaction for atomicity.
 *
 * Response: { ok: true, affected: number }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { logActivity } from "@/lib/activity";

const MAX_ITEMS = 200;

interface ReorderItem {
  id: string;
  sortOrder: number;
  folderId?: string | null;
}

function parseItems(raw: unknown): { ok: true; items: ReorderItem[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid body" };
  const body = raw as Record<string, unknown>;

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, error: "items must be a non-empty array" };
  }
  if (body.items.length > MAX_ITEMS) {
    return { ok: false, error: `items cannot exceed ${MAX_ITEMS} entries per request` };
  }

  const items: ReorderItem[] = [];
  for (const entry of body.items) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "Each item must be an object" };
    }
    const i = entry as Record<string, unknown>;
    if (typeof i.id !== "string" || i.id.length === 0 || i.id.length > 64) {
      return { ok: false, error: "Each item must have a valid string id (max 64 chars)" };
    }
    if (typeof i.sortOrder !== "number" || !Number.isFinite(i.sortOrder) || i.sortOrder < 0) {
      return { ok: false, error: "Each item must have a non-negative finite numeric sortOrder" };
    }
    const parsed: ReorderItem = { id: i.id, sortOrder: i.sortOrder };
    if (Object.prototype.hasOwnProperty.call(i, "folderId")) {
      parsed.folderId = i.folderId == null ? null : String(i.folderId).slice(0, 64);
    }
    items.push(parsed);
  }
  return { ok: true, items };
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseItems(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { items } = parsed;

  const ids = items.map((i) => i.id);

  try {
    // Ownership precheck — single query with userId predicate.
    // If any id doesn't belong to this user (or doesn't exist), count will differ.
    const owned = await prisma.workLog.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      return NextResponse.json({ error: "One or more notes not found" }, { status: 404 });
    }

    const affected = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: Record<string, any> = { sortOrder: item.sortOrder };
        if (Object.prototype.hasOwnProperty.call(item, "folderId")) {
          data.folderId = item.folderId ?? null;
        }
        await tx.workLog.update({ where: { id: item.id }, data });
      }
      return items.length;
    });

    await logActivity("WorkLog", ids[0], "reorder", `Reordered ${affected} note(s)`);
    return NextResponse.json({ ok: true, affected });
  } catch (e) {
    console.error("[work-logs/reorder] error", e);
    return NextResponse.json({ error: "Reorder failed" }, { status: 500 });
  }
}
