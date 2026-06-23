import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNullableJsonInput } from "@/lib/prisma-json";
import { getUserId } from "@/lib/auth-utils";
import { computeRetentionPlan } from "@/lib/worklog/version/snapshot";

/**
 * POST /api/work-logs/[id]/versions/[versionId]/restore — ADR-0017 Phase 6.
 *
 * Restores `WorkLog.contentJson` (and the `content` plainText projection)
 * from a chosen WorkLogVersion snapshot. Before the overwrite lands, the
 * current state is captured as a pinned (isManual=true) snapshot labelled
 * "Before restore from <target ISO>" so the operation is always reversible.
 *
 * Atomicity: the pre-restore snapshot + workLog.update run inside a single
 * prisma.$transaction([]) — either both land or neither.
 *
 * Best-effort: manual-cap retention runs AFTER the transaction; a retention
 * failure must NEVER roll back the restore.
 *
 * Security: scoped to the parent WorkLog's owner; version must belong to the
 * same workLog (no cross-note restore). Same 404 for missing-or-foreign.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, versionId } = await params;

    // Ownership guard. Also fetches the live contentJson + content (plainText
    // projection) — needed to write the pre-restore snapshot.
    const log = await prisma.workLog.findFirst({
      where: { id, userId },
      select: { id: true, contentJson: true, content: true },
    });
    if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Target version. Scoped to (id, workLogId) — no cross-note restore.
    const target = await prisma.workLogVersion.findFirst({
      where: { id: versionId, workLogId: id },
      select: { id: true, contentJson: true, plainText: true, createdAt: true },
    });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const restoredPlainText = target.plainText ?? "";
    const hasCurrentContent =
      log.contentJson !== null && log.contentJson !== undefined;
    const preRestoreLabel = `Before restore from ${target.createdAt.toISOString()}`;

    // Atomic: pre-restore snapshot (if any current state) + restore overwrite.
    const ops: ReturnType<typeof prisma.workLogVersion.create | typeof prisma.workLog.update>[] = [];
    if (hasCurrentContent) {
      ops.push(
        prisma.workLogVersion.create({
          data: {
            workLogId: id,
            userId,
            contentJson: log.contentJson!,
            plainText: log.content ?? "",
            label: preRestoreLabel,
            isManual: true,
          },
        }),
      );
    }
    ops.push(
      prisma.workLog.update({
        where: { id },
        data: {
          contentJson: toNullableJsonInput(target.contentJson),
          content: restoredPlainText,
        },
      }),
    );

    const results = await prisma.$transaction(ops);
    const updatedLog = results[results.length - 1];

    // Manual-cap retention — best-effort, outside the transaction so a
    // cleanup failure can never roll back the restore itself.
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
      console.error("[ADR-0017] post-restore retention failed", retErr);
    }

    return NextResponse.json(updatedLog);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
