/**
 * POST /api/work-logs/import
 *
 * Note-import endpoint. Accepts a raw markdown or HTML payload, parses it into
 * a ProseMirror doc via the Sprint 1 pure helpers, dedupes by sha256 of the
 * source bytes (Sprint 2 invariant: one WorkLog per (userId, sourceType,
 * fingerprint)), and creates the WorkLog + WorkLogImport audit row in a
 * transaction.
 *
 * Status codes (locked in Sprint 3 spec):
 *   - 201 — new WorkLog created
 *   - 200 — dedupe hit, returns existing WorkLog with `deduped: true`
 *   - 400 — validation / parse failure (also writes a `failed` WorkLogImport)
 *   - 401 — unauthenticated
 *   - 404 — folderId provided but not owned
 *   - 413 — source exceeds 5 MB cap
 *
 * Body:
 *   {
 *     sourceType: "markdown" | "html",
 *     source: string,
 *     sourceFilename?: string,
 *     folderId?: string,
 *   }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toJsonInput } from "@/lib/prisma-json";
import { getUserId } from "@/lib/auth-utils";
import { validateContentJson } from "@/lib/worklog/content-json";
import { importMarkdown } from "@/lib/worklog/import/markdown-to-pm";
import { importHtml } from "@/lib/worklog/import/html-to-pm";
import { computeSourceFingerprint } from "@/lib/worklog/import/fingerprint";
import {
  buildWorkLogImportRecord,
  type ImportSourceType,
} from "@/lib/worklog/import/build-import-record";
import type { ImportResult } from "@/lib/worklog/import/types";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024; // 5 MB — Q1=B from Sprint 3 plan
const VALID_SOURCE_TYPES: ReadonlySet<string> = new Set(["markdown", "html"]);

type ImportRequestBody = {
  sourceType?: unknown;
  source?: unknown;
  sourceFilename?: unknown;
  folderId?: unknown;
};

function badRequest(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  // ── shape validation ────────────────────────────────────────
  const { sourceType, source, sourceFilename, folderId } = body;

  if (typeof sourceType !== "string" || !VALID_SOURCE_TYPES.has(sourceType)) {
    return badRequest(
      `sourceType must be one of: ${[...VALID_SOURCE_TYPES].join(", ")}`,
    );
  }
  if (typeof source !== "string" || source.length === 0) {
    return badRequest("source is required and must be a non-empty string");
  }

  // Byte length, not character length — protects against multibyte payloads.
  const sourceByteLength = Buffer.byteLength(source, "utf8");
  if (sourceByteLength > MAX_SOURCE_BYTES) {
    return badRequest(
      `source exceeds ${MAX_SOURCE_BYTES} bytes (5 MB cap)`,
      413,
    );
  }

  const typedSourceType = sourceType as ImportSourceType;
  const filenameStr =
    typeof sourceFilename === "string" && sourceFilename.trim().length > 0
      ? sourceFilename.trim()
      : null;
  const folderIdStr =
    typeof folderId === "string" && folderId.length > 0 ? folderId : null;

  // ── folder ownership ────────────────────────────────────────
  if (folderIdStr) {
    const folder = await prisma.workLogFolder.findFirst({
      where: { id: folderIdStr, userId },
      select: { id: true },
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
  }

  // ── fingerprint + dedupe lookup ─────────────────────────────
  const sourceFingerprint = computeSourceFingerprint(source);

  const existing = await prisma.workLogImport.findUnique({
    where: {
      userId_sourceType_sourceFingerprint: {
        userId,
        sourceType: typedSourceType,
        sourceFingerprint,
      },
    },
    include: { workLog: true },
  });

  if (existing && existing.workLog) {
    return NextResponse.json(
      {
        workLog: existing.workLog,
        import: existing,
        deduped: true,
      },
      { status: 200 },
    );
  }

  // ── parse ───────────────────────────────────────────────────
  let parsed: ImportResult;
  try {
    parsed =
      typedSourceType === "markdown"
        ? importMarkdown(source, { filename: filenameStr ?? undefined })
        : importHtml(source, { filename: filenameStr ?? undefined });
  } catch (err) {
    // Parser blew up. Record the failure and surface the error.
    const errorMessage = err instanceof Error ? err.message : String(err);
    const failedRecord = buildWorkLogImportRecord({
      userId,
      sourceType: typedSourceType,
      sourceFingerprint,
      droppedBlocks: [],
      sourceFilename: filenameStr,
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    });
    const failedImport = await prisma.workLogImport.create({
      data: failedRecord,
    });
    return NextResponse.json(
      { error: errorMessage, importId: failedImport.id },
      { status: 400 },
    );
  }

  // ── contentJson size guard (parsed JSON can dwarf the source) ──
  const contentValidation = validateContentJson(parsed.contentJson);
  if (!contentValidation.ok) {
    const failedRecord = buildWorkLogImportRecord({
      userId,
      sourceType: typedSourceType,
      sourceFingerprint,
      droppedBlocks: parsed.droppedBlocks,
      sourceFilename: filenameStr,
      status: "failed",
      errorMessage: contentValidation.error,
      completedAt: new Date(),
    });
    const failedImport = await prisma.workLogImport.create({
      data: failedRecord,
    });
    return NextResponse.json(
      { error: contentValidation.error, importId: failedImport.id },
      { status: 400 },
    );
  }

  // ── create WorkLog + succeeded WorkLogImport (atomic) ──
  // Interactive transaction ensures a race-losing P2002 on the import insert
  // rolls back the WorkLog, so we never leave orphan WorkLog rows.
  const now = new Date();

  try {
    const { workLog, importRow } = await prisma.$transaction(async (tx) => {
      const wl = await tx.workLog.create({
        data: {
          userId,
          positionId: null,
          shiftId: null,
          date: now,
          workdayDate: now,
          title: parsed.title,
          content: parsed.plaintext,
          contentJson: contentValidation.value ? toJsonInput(contentValidation.value) : undefined,
          category: "note",
          hours: null,
          tags: null,
          accomplishment: false,
          impact: null,
          isNotable: false,
          mood: null,
          templateId: null,
          equipmentIds: [],
          assetIds: [],
          folderId: folderIdStr,
        },
      });

      const successRecord = buildWorkLogImportRecord({
        userId,
        sourceType: typedSourceType,
        sourceFingerprint,
        droppedBlocks: parsed.droppedBlocks,
        sourceFilename: filenameStr,
        status: "succeeded",
        workLogId: wl.id,
        completedAt: new Date(),
      });

      const imp = await tx.workLogImport.create({ data: successRecord });
      return { workLog: wl, importRow: imp };
    });

    return NextResponse.json(
      { workLog, import: importRow, deduped: false },
      { status: 201 },
    );
  } catch (err) {
    // Race: another request inserted the same (userId, sourceType, fingerprint)
    // between our dedupe lookup and our insert. Re-read the existing row.
    if (isUniqueViolation(err)) {
      const racewin = await prisma.workLogImport.findUnique({
        where: {
          userId_sourceType_sourceFingerprint: {
            userId,
            sourceType: typedSourceType,
            sourceFingerprint,
          },
        },
        include: { workLog: true },
      });
      if (racewin && racewin.workLog) {
        return NextResponse.json(
          {
            workLog: racewin.workLog,
            import: racewin,
            deduped: true,
          },
          { status: 200 },
        );
      }
    }
    // Unknown error path — re-raise as 500. App-Insights will pick it up.
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/** Prisma surfaces unique-constraint failures as { code: "P2002" }. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
