/**
 * GET /api/work-logs/[id]/backlinks
 *
 * Returns the list of WorkLog entries that mention the target note via an
 * `@n:` mention (i.e. their `linkedNoteIds` array contains the target id).
 *
 * Owner-scoped: only the signed-in user's notes are searched, and the
 * target note itself is filtered out (`NOT: { id }`).
 *
 * Response shape: `Array<{ id, label, date, positionId }>`. `label` follows
 * the shared worklog-label fallback chain (title → first content line → date),
 * see `src/lib/worklog/derive-worklog-label.ts`.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { deriveWorklogLabel } from "@/lib/worklog/derive-worklog-label";

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
    select: { id: true, title: true, contentJson: true, date: true, positionId: true },
    orderBy: { date: "desc" },
  });

  const result = rows.map((r) => ({
    id: r.id,
    label: deriveWorklogLabel({
      title: r.title,
      contentJson: r.contentJson,
      date: r.date,
    }),
    date: r.date.toISOString(),
    positionId: r.positionId,
  }));

  return NextResponse.json(result);
}
