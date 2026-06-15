/**
 * GET /api/contacts/[id]/backlinks (ADR-0028)
 *
 * Returns the list of WorkLog entries that mention the target contact via an
 * `@p:` mention (i.e. their `linkedContactIds` array contains the target id).
 *
 * Owner-scoped twice-over: (1) the contact id MUST belong to the signed-in
 * user — otherwise 404, never proceed to the WorkLog query — and (2) the
 * WorkLog scan is filtered by the same `userId`. Tighter shape than ADR-0016's
 * `/api/work-logs/[id]/backlinks` route (which scopes only the WorkLog query);
 * see ADR-0028 "Out of scope" — the worklog route is not retroactively
 * tightened in this sprint.
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

  // Verify the contact belongs to the signed-in user. Without this guard the
  // endpoint would silently return [] for unowned ids, leaking nothing but
  // also conflating "contact not yours" with "contact has no backlinks."
  const contact = await prisma.contact.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await prisma.workLog.findMany({
    where: {
      userId,
      linkedContactIds: { has: id },
    },
    select: {
      id: true,
      title: true,
      contentJson: true,
      date: true,
      positionId: true,
    },
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
