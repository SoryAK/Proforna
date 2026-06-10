import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/work-logs/[id]/versions/[versionId] — ADR-0017 Phase 8a.
 *
 * Per-version read endpoint. Returns the FULL snapshot (contentJson +
 * untruncated plainText + metadata) so the UI can render a meaningful
 * diff against the live document. The list endpoint deliberately
 * strips contentJson and truncates plainText to 200 chars to keep the
 * panel response cheap — this endpoint is the on-demand counterpart.
 *
 * Owner-scoped via parent WorkLog. Same 404 for missing-or-foreign on
 * both the parent and the version (no existence leak).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, versionId } = await params;

    // Ownership guard on the parent.
    const log = await prisma.workLog.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Version must belong to this parent — no cross-note read.
    const version = await prisma.workLogVersion.findFirst({
      where: { id: versionId, workLogId: id },
      select: {
        id: true,
        createdAt: true,
        label: true,
        isManual: true,
        contentJson: true,
        plainText: true,
      },
    });
    if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      id:          version.id,
      createdAt:   version.createdAt.toISOString(),
      label:       version.label,
      isManual:    version.isManual,
      contentJson: version.contentJson,
      plainText:   version.plainText ?? "",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
