/**
 * POST /api/work-logs/folders/reorder
 *
 * Bulk-reorder WorkLogFolder entries within (and optionally across) parents.
 * Implements AD-1 (dense integer sortOrder) and AD-3 (separate endpoint).
 *
 * Body:
 *   { items: Array<{ id: string; sortOrder: number; parentId?: string | null }> }
 *
 * Security:
 *   • Authenticated via getUserId().
 *   • Ownership precheck — all folder ids must belong to the authenticated user.
 *   • For items with a new parentId, assertNoCycle + depth check run BEFORE
 *     the transaction so we never write a partial tree mutation on validation fail.
 *   • items clamped to MAX_ITEMS to prevent DoS.
 *   • Wrapped in $transaction for atomicity.
 *
 * Response: { ok: true, affected: number }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { logActivity } from "@/lib/activity";
import { assertNoCycle, getDepth, FOLDER_MAX_DEPTH } from "@/lib/worklog-folders";

const MAX_ITEMS = 200;

interface FolderReorderItem {
  id: string;
  sortOrder: number;
  parentId?: string | null;
}

function parseItems(
  raw: unknown,
): { ok: true; items: FolderReorderItem[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid body" };
  const body = raw as Record<string, unknown>;

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, error: "items must be a non-empty array" };
  }
  if (body.items.length > MAX_ITEMS) {
    return { ok: false, error: `items cannot exceed ${MAX_ITEMS} entries per request` };
  }

  const items: FolderReorderItem[] = [];
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
    const parsed: FolderReorderItem = { id: i.id, sortOrder: i.sortOrder };
    if (Object.prototype.hasOwnProperty.call(i, "parentId")) {
      parsed.parentId = i.parentId == null ? null : String(i.parentId).slice(0, 64);
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
    const owned = await prisma.workLogFolder.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      return NextResponse.json({ error: "One or more folders not found" }, { status: 404 });
    }

    // Pre-transaction validation for items that carry a new parentId.
    // Must run before the transaction so we never commit a partial tree mutation.
    const reparentItems = items.filter(
      (i) => Object.prototype.hasOwnProperty.call(i, "parentId") && i.parentId !== undefined,
    );

    if (reparentItems.length > 0) {
      const allFolders = await prisma.workLogFolder.findMany({
        where: { userId },
        select: { id: true, parentId: true },
      });

      for (const item of reparentItems) {
        const newParentId = item.parentId ?? null;
        if (newParentId === null) continue; // moving to root — no cycle possible

        // Ownership check on new parent.
        const parentOwned = allFolders.some((f) => f.id === newParentId);
        if (!parentOwned) {
          return NextResponse.json(
            { error: `Parent folder ${newParentId} not found` },
            { status: 404 },
          );
        }

        // Cycle guard.
        try {
          assertNoCycle(item.id, newParentId, allFolders);
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Cycle detected" },
            { status: 400 },
          );
        }

        // Depth enforcement.
        const depth = getDepth(newParentId, allFolders) + 1;
        if (depth >= FOLDER_MAX_DEPTH) {
          return NextResponse.json(
            { error: `Move would exceed the ${FOLDER_MAX_DEPTH}-level nesting limit` },
            { status: 400 },
          );
        }
      }
    }

    const affected = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const data: Record<string, unknown> = { sortOrder: item.sortOrder };
        if (Object.prototype.hasOwnProperty.call(item, "parentId")) {
          data.parentId = item.parentId ?? null;
        }
        await tx.workLogFolder.update({ where: { id: item.id }, data });
      }
      return items.length;
    });

    await logActivity(
      "WorkLogFolder",
      ids[0],
      "reorder",
      `Reordered ${affected} folder(s)`,
    );
    return NextResponse.json({ ok: true, affected });
  } catch (e) {
    console.error("[work-logs/folders/reorder] error", e);
    return NextResponse.json({ error: "Reorder failed" }, { status: 500 });
  }
}
