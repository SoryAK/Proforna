/**
 * POST /api/work-logs/bulk
 *
 * Bulk multi-select actions on a user's WorkLog entries (W1.3 roadmap).
 *
 * Body:
 *   { action: "move" | "delete", ids: string[], payload?: { folderId?: string | null } }
 *
 * Security (Security Sentinel):
 *   • Authenticated via getUserId(); userId predicate is ALWAYS applied to
 *     both the workLog query and the folder ownership precheck — preventing
 *     IDOR via crafted ids or cross-tenant folder targets.
 *   • `ids.length` clamped to [1, MAX_IDS] to prevent DoS via giant arrays.
 *   • Wrapped in `$transaction` so a partial failure rolls back cleanly.
 *
 * Response: { ok: true, affected: number }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const MAX_IDS = 200;
const ACTIONS = ["move", "delete", "archive", "unarchive"] as const;
type BulkAction = (typeof ACTIONS)[number];

interface BulkBody {
  action: BulkAction;
  ids: string[];
  payload?: { folderId?: string | null };
}

function parseBody(body: unknown): { ok: true; value: BulkBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;

  if (typeof b.action !== "string" || !ACTIONS.includes(b.action as BulkAction)) {
    return { ok: false, error: `action must be one of: ${ACTIONS.join(", ")}` };
  }
  if (!Array.isArray(b.ids) || b.ids.length === 0) {
    return { ok: false, error: "ids must be a non-empty array" };
  }
  if (b.ids.length > MAX_IDS) {
    return { ok: false, error: `ids cannot exceed ${MAX_IDS} entries per request` };
  }
  if (!b.ids.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)) {
    return { ok: false, error: "ids must be non-empty strings" };
  }

  let payload: BulkBody["payload"];
  if (b.action === "move") {
    if (!b.payload || typeof b.payload !== "object") {
      return { ok: false, error: "move action requires payload.folderId" };
    }
    const p = b.payload as Record<string, unknown>;
    if (p.folderId !== null && typeof p.folderId !== "string") {
      return { ok: false, error: "payload.folderId must be string or null" };
    }
    payload = { folderId: p.folderId as string | null };
  }

  return {
    ok: true,
    value: { action: b.action as BulkAction, ids: b.ids as string[], payload },
  };
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

  const parsed = parseBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { action, ids, payload } = parsed.value;

  try {
    const affected = await prisma.$transaction(async (tx) => {
      if (action === "delete") {
        // userId predicate guarantees we never touch another user's rows
        // even if the id list contains foreign ids.
        const result = await tx.workLog.deleteMany({ where: { id: { in: ids }, userId } });
        return result.count;
      }

      // ADR-0026 — archive / unarchive (Gmail-style soft-archive bucket).
      // Server clamps the timestamp so client clock skew never drifts the
      // archive ordering. Same userId predicate as delete — cross-tenant
      // ids are silently filtered out.
      if (action === "archive" || action === "unarchive") {
        const result = await tx.workLog.updateMany({
          where: { id: { in: ids }, userId },
          data: { archivedAt: action === "archive" ? new Date() : null },
        });
        return result.count;
      }

      // action === "move"
      const targetFolderId = payload?.folderId ?? null;

      if (targetFolderId !== null) {
        // Cross-tenant folder protection: verify the folder is owned by
        // this user BEFORE moving notes into it.
        const folder = await tx.workLogFolder.findFirst({
          where: { id: targetFolderId, userId },
          select: { id: true },
        });
        if (!folder) {
          throw new Error("FOLDER_NOT_FOUND");
        }
      }

      const result = await tx.workLog.updateMany({
        where: { id: { in: ids }, userId },
        data: { folderId: targetFolderId },
      });
      return result.count;
    });

    return NextResponse.json({ ok: true, affected });
  } catch (e) {
    if (e instanceof Error && e.message === "FOLDER_NOT_FOUND") {
      return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
    }
    console.error("[work-logs/bulk] error", e);
    return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 });
  }
}
