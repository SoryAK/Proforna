import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { worklogToMarkdown } from "@/lib/worklog/export/worklog-to-markdown";
import type { ProseMirrorDoc } from "@/lib/worklog/import/types";

/**
 * GET /api/work-logs/[id]/export — "Grill Me" markdown export.
 *
 * Returns a `.md` file with grill-me frontmatter (id, version, exportedAt,
 * title) so the user can take the note to any external AI for Socratic
 * grilling and re-import the rewritten file via the import-md route.
 *
 * Security: scoped to the worklog's owner. Same-status 404 for "missing"
 * vs "belongs to another user" — existence is never leaked.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const worklog = await prisma.workLog.findFirst({
    where: { id, userId },
    select: { id: true, title: true, contentJson: true },
  });
  if (!worklog) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const versionCount = await prisma.workLogVersion.count({
    where: { workLogId: id },
  });

  const contentJson: ProseMirrorDoc =
    worklog.contentJson && typeof worklog.contentJson === "object"
      ? (worklog.contentJson as unknown as ProseMirrorDoc)
      : { type: "doc", content: [] };

  const { markdown, filename } = worklogToMarkdown({
    id: worklog.id,
    title: worklog.title,
    contentJson,
    versionCount,
    exportedAt: new Date(),
  });

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
