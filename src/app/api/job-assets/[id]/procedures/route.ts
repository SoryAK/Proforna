/**
 * GET /api/job-assets/[id]/procedures (ADR-0029 Unit 8)
 *
 * Cross-cut backlinks. Returns the list of WorkLog entries with
 * `kind = 'procedure'` whose `assetIds` array contains the target asset id.
 *
 * Owner-scoped twice-over (per ADR-0028 cross-cut recipe):
 *   (1) the asset id MUST belong to the signed-in user — otherwise 404,
 *       never proceed to the WorkLog query;
 *   (2) the WorkLog scan is filtered by the same `userId`.
 *
 * No `NOT: { id }` self-filter — assets and worklogs are different entity
 * types, so the dead clause would only confuse reviewers (per recipe).
 *
 * Response shape: `Array<{ id, label, date, positionId }>`. `label` follows
 * the shared worklog-label fallback chain (title → first content line → date).
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

  // Verify the asset belongs to the signed-in user. Without this guard the
  // endpoint would silently return [] for unowned ids, conflating "asset
  // not yours" with "asset has no linked procedures."
  const asset = await prisma.jobAsset.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await prisma.workLog.findMany({
    where: {
      userId,
      kind: "procedure",
      assetIds: { has: id },
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
