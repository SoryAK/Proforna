import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

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
      const preview =
        text.length > PREVIEW_MAX_CHARS
          ? text.slice(0, PREVIEW_MAX_CHARS) + ELLIPSIS
          : text;
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
