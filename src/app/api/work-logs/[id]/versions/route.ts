import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { computeRetentionPlan } from "@/lib/worklog/version/snapshot";

/**
 * GET /api/work-logs/[id]/versions — list endpoint for the History tab.
 *
 * Per ADR-0017 Phase 4: returns snapshot rows newest-first with a 200-char
 * plainText preview and a char-delta computed against the chronologically-
 * prior row. `contentJson` is intentionally NOT included — the list view
 * doesn't need it, and including it would multiply payload size by ~3KB
 * per row.
 *
 * Security: scoped to the parent WorkLog's owner. Same-status 404 for
 * "does not exist" and "belongs to another user" — existence is not leaked.
 */

const PREVIEW_MAX_CHARS = 200;
const ELLIPSIS = "…";
const LABEL_MAX_CHARS = 80;

function truncatePreview(text: string | null): string {
  const value = text ?? "";
  return value.length > PREVIEW_MAX_CHARS
    ? value.slice(0, PREVIEW_MAX_CHARS) + ELLIPSIS
    : value;
}

export interface VersionListItem {
  id: string;
  createdAt: string; // ISO
  label: string | null;
  isManual: boolean;
  plainTextPreview: string;
  charDelta: number;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    // Ownership guard. Same 404 response whether the log is missing or
    // belongs to another user — never leak existence.
    const owns = await prisma.workLog.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await prisma.workLogVersion.findMany({
      where: { workLogId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        label: true,
        isManual: true,
        plainText: true,
        // contentJson: intentionally NOT selected (payload bloat).
      },
    });

    // Compute deltas in chronological order, then re-project to newest-first
    // for the response.
    const chronological = [...rows].reverse();
    const deltaById = new Map<string, number>();
    let prevLen = 0;
    for (const row of chronological) {
      const len = (row.plainText ?? "").length;
      deltaById.set(row.id, len - prevLen);
      prevLen = len;
    }

    const body: VersionListItem[] = rows.map((row) => {
      const text = row.plainText ?? "";
      const preview = truncatePreview(text);
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        label: row.label,
        isManual: row.isManual,
        plainTextPreview: preview,
        charDelta: deltaById.get(row.id) ?? 0,
      };
    });

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/work-logs/[id]/versions — manual snapshot.
 *
 * Body: { label?: string } (optional, trimmed, max 80 chars)
 *
 * Captures the LIVE WorkLog.contentJson + content as a pinned (isManual=true)
 * snapshot. Manual snapshots bypass the tiered auto-thinning rules but are
 * subject to the per-note manual cap (MANUAL_CAP_PER_NOTE = 50) — once that
 * cap is hit, the oldest manual row is evicted FIFO via computeRetentionPlan.
 *
 * Returns 201 with the same shape as a row from GET (no contentJson).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    // Ownership guard. Also fetches the live contentJson + content (plainText)
    // to capture into the snapshot — single round trip.
    const log = await prisma.workLog.findFirst({
      where: { id, userId },
      select: { id: true, contentJson: true, content: true },
    });
    if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (log.contentJson === null || log.contentJson === undefined) {
      return NextResponse.json(
        { error: "Note has no content to snapshot yet" },
        { status: 400 },
      );
    }

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rawLabel = typeof raw.label === "string" ? raw.label.trim() : "";
    if (rawLabel.length > LABEL_MAX_CHARS) {
      return NextResponse.json(
        { error: `Label must be ${LABEL_MAX_CHARS} characters or fewer` },
        { status: 400 },
      );
    }
    const label = rawLabel.length > 0 ? rawLabel : null;

    const plainText = log.content ?? "";

    const row = await prisma.workLogVersion.create({
      data: {
        workLogId: id,
        userId,
        contentJson: log.contentJson,
        plainText,
        label,
        isManual: true,
      },
      select: {
        id: true,
        createdAt: true,
        label: true,
        isManual: true,
        plainText: true,
      },
    });

    // Manual-cap retention — best-effort. Bounded by per-note version count.
    try {
      const all = await prisma.workLogVersion.findMany({
        where: { workLogId: id },
        select: { id: true, createdAt: true, isManual: true },
      });
      const plan = computeRetentionPlan({ versions: all, now: new Date() });
      if (plan.delete.length > 0) {
        await prisma.workLogVersion.deleteMany({
          where: { id: { in: plan.delete } },
        });
      }
    } catch (retErr) {
      console.error("[ADR-0017] manual-snapshot retention failed", retErr);
    }

    const body: VersionListItem = {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      label: row.label,
      isManual: row.isManual,
      plainTextPreview: truncatePreview(row.plainText),
      charDelta: (row.plainText ?? "").length, // chronologically first delta is vs ""
    };
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
