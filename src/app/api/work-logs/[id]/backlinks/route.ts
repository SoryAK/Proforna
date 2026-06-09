/**
 * GET /api/work-logs/[id]/backlinks
 *
 * Returns the list of WorkLog entries that mention the target note via an
 * `@n:` mention (i.e. their `linkedNoteIds` array contains the target id).
 *
 * Owner-scoped: only the signed-in user's notes are searched, and the
 * target note itself is filtered out (`NOT: { id }`).
 *
 * Response shape: `Array<{ id, label, date, positionId }>`. `label` is the
 * first non-empty plain-text line of `contentJson`, falling back to the
 * workday date when the doc is empty (mirrors the picker's derivation).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { proseMirrorDocToPlainText } from "@/lib/worklog/prosemirror-to-text";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const rows = await prisma.workLog.findMany({
    where: {
      userId,
      linkedNoteIds: { has: id },
      NOT: { id },
    },
    select: { id: true, contentJson: true, date: true, positionId: true },
    orderBy: { date: "desc" },
  });

  const result = rows.map((r) => ({
    id: r.id,
    label: deriveWorklogLabel(r.contentJson, r.date),
    date: r.date.toISOString(),
    positionId: r.positionId,
  }));

  return NextResponse.json(result);
}

/**
 * Mirror of the worklog label derivation in mention-search/route.ts. Kept
 * inline (not extracted) until a third caller appears — the rule of three
 * applies, and an extraction now would mostly serialize cosmetic copies.
 */
function deriveWorklogLabel(contentJson: unknown, date: Date): string {
  const text = proseMirrorDocToPlainText(contentJson).trim();
  if (text) {
    const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (firstLine) {
      return firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine;
    }
  }
  return date.toISOString().slice(0, 10);
}
