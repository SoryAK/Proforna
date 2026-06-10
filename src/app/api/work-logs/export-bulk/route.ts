import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { worklogToMarkdown } from "@/lib/worklog/export/worklog-to-markdown";
import type { ProseMirrorDoc } from "@/lib/worklog/import/types";

/**
 * POST /api/work-logs/export-bulk — bulk "Grill Me" markdown export.
 *
 * Body: { ids: string[] }  (1..100 ids)
 *
 * Behaviour:
 *   - 1 owned id   -> single .md attachment (same shape as Phase 2 single export)
 *   - N > 1 owned  -> .zip containing N .md files
 *   - 0 owned ids  -> 404 (existence not leaked)
 *
 * Ids that do not belong to the authenticated user are silently dropped.
 * That mirrors the Phase 2 single-id "no leak" guarantee at the bulk shape.
 */

const BULK_MAX = 100;

interface BulkBody {
  ids: string[];
}

function parseBody(value: unknown): BulkBody | null {
  if (!value || typeof value !== "object") return null;
  const ids = (value as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return null;
  if (ids.length === 0 || ids.length > BULK_MAX) return null;
  if (!ids.every((id) => typeof id === "string" && id.length > 0)) return null;
  return { ids: ids as string[] };
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      { error: `Bad request: ids must be a string array of 1-${BULK_MAX} items` },
      { status: 400 },
    );
  }

  // Owner-scoped fetch. Ids belonging to other users are silently absent from
  // the result set.
  const worklogs = await prisma.workLog.findMany({
    where: { userId, id: { in: body.ids } },
    select: { id: true, title: true, contentJson: true },
  });

  if (worklogs.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Single fetch of version counts for all owned ids.
  const versionGroups = await prisma.workLogVersion.groupBy({
    by: ["workLogId"],
    where: { workLogId: { in: worklogs.map((w) => w.id) } },
    _count: { _all: true },
  });
  const versionCountById = new Map<string, number>();
  for (const g of versionGroups) {
    versionCountById.set(g.workLogId, g._count._all);
  }

  const exportedAt = new Date();

  const exports = worklogs.map((w) => {
    const contentJson: ProseMirrorDoc =
      w.contentJson && typeof w.contentJson === "object"
        ? (w.contentJson as unknown as ProseMirrorDoc)
        : { type: "doc", content: [] };
    return worklogToMarkdown({
      id: w.id,
      title: w.title,
      contentJson,
      versionCount: versionCountById.get(w.id) ?? 0,
      exportedAt,
    });
  });

  // Single-id branch: same artifact as Phase 2.
  if (exports.length === 1) {
    const single = exports[0];
    return new NextResponse(single.markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${single.filename}"`,
      },
    });
  }

  // Multi: zip with collision-safe filenames.
  const zip = new JSZip();
  const used = new Set<string>();
  for (let i = 0; i < exports.length; i++) {
    const ex = exports[i];
    const id = worklogs[i].id;
    const filename = uniquify(ex.filename, id, used);
    zip.file(filename, ex.markdown);
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  const zipName = `worklogs-${exportedAt.toISOString().slice(0, 10)}.zip`;

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
}

/**
 * Returns a zip-safe filename. If the slugged name is already used, append
 * a short id suffix before the extension to make it unique.
 */
function uniquify(filename: string, id: string, used: Set<string>): string {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  const ext = dot >= 0 ? filename.slice(dot) : "";
  // Use first 6 alphanumeric chars of the id (after stripping `wl_` prefix).
  const shortId = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "x";
  let candidate = `${stem}-${shortId}${ext}`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${stem}-${shortId}-${n}${ext}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}
