/**
 * POST /api/integrations/notion/import  (Sprint 6B v1, ADR-0019)
 *
 * Body: { pageIds: string[] } — Notion page IDs the user selected.
 *
 * Per ADR-0019:
 *   - Skip-on-reimport — if WorkLog (userId, externalSource:"notion", pageId)
 *     already exists, that page is marked "skipped" and the existing WorkLog
 *     is NOT mutated (protects the user's local edits).
 *   - All imports land in an auto-created "Imported from Notion" folder.
 *   - Each successful import writes a WorkLog + WorkLogImport audit row in
 *     a transaction. Fingerprint = pageId (Notion pages don't have stable
 *     serialized bytes; pageId is the natural idempotency key).
 *
 * Returns:
 *   {
 *     results: Array<{ pageId, status: "imported" | "skipped" | "failed",
 *                       workLogId?: string, error?: string }>,
 *     folderId: string  // the "Imported from Notion" folder
 *   }
 *
 * Status codes:
 *   - 200 — request processed (per-page status in body)
 *   - 400 — invalid body
 *   - 401 — unauthenticated
 *   - 404 — no enabled Notion connection
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { validateContentJson } from "@/lib/worklog/content-json";
import {
  buildNotionClient,
  fetchPageContent,
  type NotionConnectionConfig,
} from "@/lib/integrations/notion-client";
import { importNotion } from "@/lib/worklog/import/notion-to-pm";
import { buildWorkLogImportRecord } from "@/lib/worklog/import/build-import-record";

const NOTION_FOLDER_NAME = "Imported from Notion";
const MAX_PAGES_PER_REQUEST = 25;

type ImportRequestBody = {
  pageIds?: unknown;
};

type PerPageResult = {
  pageId: string;
  status: "imported" | "skipped" | "failed";
  workLogId?: string;
  title?: string;
  error?: string;
};

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── body validation ─────────────────────────────────────────
  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rawIds = body.pageIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json(
      { error: "pageIds must be a non-empty array" },
      { status: 400 },
    );
  }
  if (rawIds.length > MAX_PAGES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Cannot import more than ${MAX_PAGES_PER_REQUEST} pages at once` },
      { status: 400 },
    );
  }
  const pageIds = rawIds
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
  if (pageIds.length === 0) {
    return NextResponse.json(
      { error: "pageIds must contain at least one non-empty string" },
      { status: 400 },
    );
  }

  // ── connection lookup ───────────────────────────────────────
  const conn = await prisma.integrationConnection.findFirst({
    where: { userId, provider: "notion", enabled: true },
    select: { id: true, config: true },
  });
  if (!conn) {
    return NextResponse.json(
      { error: "No active Notion connection" },
      { status: 404 },
    );
  }

  const client = buildNotionClient(conn.config as NotionConnectionConfig);

  // ── folder bootstrap ────────────────────────────────────────
  const folder = await ensureImportFolder(userId);

  // ── per-page processing (sequential — Notion rate-limits aggressively) ──
  const results: PerPageResult[] = [];
  for (const pageId of pageIds) {
    // Skip-on-reimport — protects local edits.
    const existing = await prisma.workLog.findFirst({
      where: { userId, externalSource: "notion", externalId: pageId },
      select: { id: true, title: true },
    });
    if (existing) {
      results.push({
        pageId,
        status: "skipped",
        workLogId: existing.id,
        title: existing.title,
      });
      continue;
    }

    try {
      const page = await fetchPageContent(client, pageId);
      const parsed = importNotion({
        title: page.title,
        blocks: page.blocks,
      });

      const contentValidation = validateContentJson(parsed.contentJson);
      if (!contentValidation.ok) {
        results.push({
          pageId,
          status: "failed",
          error: contentValidation.error,
        });
        continue;
      }

      const now = new Date();

      const { workLog } = await prisma.$transaction(async (tx) => {
        const wl = await tx.workLog.create({
          data: {
            userId,
            positionId: null,
            shiftId: null,
            date: now,
            workdayDate: now,
            title: parsed.title,
            content: parsed.plaintext,
            contentJson: (contentValidation.value ?? undefined) as Prisma.InputJsonValue,
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
            folderId: folder.id,
            externalSource: "notion",
            externalId: pageId,
          },
        });

        const successRecord = buildWorkLogImportRecord({
          userId,
          sourceType: "notion",
          sourceFingerprint: pageId,
          droppedBlocks: parsed.droppedBlocks,
          sourceFilename: null,
          status: "succeeded",
          workLogId: wl.id,
          completedAt: new Date(),
        });
        await tx.workLogImport.create({ data: successRecord });

        return { workLog: wl };
      });

      results.push({
        pageId,
        status: "imported",
        workLogId: workLog.id,
        title: workLog.title,
      });
    } catch (e) {
      // Race: another request created (userId, "notion", pageId) between our
      // existence check and our insert. Treat as a benign skip.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const racewin = await prisma.workLog.findFirst({
          where: { userId, externalSource: "notion", externalId: pageId },
          select: { id: true, title: true },
        });
        if (racewin) {
          results.push({
            pageId,
            status: "skipped",
            workLogId: racewin.id,
            title: racewin.title,
          });
          continue;
        }
      }
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`Notion import failed for page ${pageId}`, msg);
      results.push({ pageId, status: "failed", error: redact(msg) });
    }
  }

  return NextResponse.json({ results, folderId: folder.id });
}

async function ensureImportFolder(userId: string) {
  const existing = await prisma.workLogFolder.findFirst({
    where: { userId, parentId: null, name: NOTION_FOLDER_NAME },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.workLogFolder.create({
    data: {
      userId,
      name: NOTION_FOLDER_NAME,
      parentId: null,
      sortOrder: 0,
    },
    select: { id: true },
  });
}

/** Shorten and strip any accidental token leakage from Notion error text. */
function redact(msg: string): string {
  return msg
    .replace(/secret_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/ntn_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 200);
}
