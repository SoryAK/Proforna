import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { unlink } from "fs/promises";
import path from "path";

// POST /api/work-logs/photos/reconcile
// Body: { workLogId: string, source: "body" | "panel", keepIds: string[] }
//
// Deletes any WorkLogPhoto rows matching (workLogId, source) whose `id`
// is NOT in `keepIds`. Designed to be called on note save / close so that
// images removed from a Tiptap body doc (where node deletion happens
// purely in-document) eventually become free disk space.
//
// We intentionally accept the full keep-list rather than a delta:
//   • Server has no observable record of "what was in the doc before."
//   • Client always knows the canonical current list (walk doc, collect ids).
//   • Eventual-consistency is fine here — orphaned files are wasted disk,
//     never a correctness issue, and the next save will clean them up.
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      workLogId?: string;
      source?: string;
      keepIds?: unknown;
    };
    const { workLogId } = body;
    const source = body.source === "body" ? "body" : "panel";
    const keepIds = Array.isArray(body.keepIds) ? body.keepIds.filter((v): v is string => typeof v === "string") : [];

    if (!workLogId) {
      return NextResponse.json({ error: "workLogId required" }, { status: 400 });
    }

    const log = await prisma.workLog.findUnique({
      where: { id: workLogId },
      select: { id: true, userId: true },
    });
    if (!log || log.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const orphans = await prisma.workLogPhoto.findMany({
      where: {
        workLogId,
        source,
        ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}),
      },
      select: { id: true, filePath: true },
    });

    if (orphans.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    for (const o of orphans) {
      if (o.filePath.startsWith("/uploads/")) {
        try {
          await unlink(path.join(process.cwd(), "public", o.filePath));
        } catch {
          // ignore missing file — DB row is still the source of truth
        }
      }
    }

    await prisma.workLogPhoto.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });

    return NextResponse.json({ deleted: orphans.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
