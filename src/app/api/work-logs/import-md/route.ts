/**
 * POST /api/work-logs/import-md — "Grill Me" round-trip re-import endpoint.
 *
 * Accepts the markdown file the user round-tripped through an external AI,
 * reads its grill-me frontmatter, and returns one of four outcomes:
 *
 *   - imported     — frontmatter id matches a worklog the user owns AND
 *                    file version >= current count → wrote new contentJson,
 *                    fired auto-snapshot, returns 200
 *   - conflict     — frontmatter matches but server has changed since export
 *                    → returns the file body + server body so the client can
 *                    show the 3-way diff modal
 *   - needs-picker — file has no frontmatter (or AI stripped it) → returns
 *                    parsed body so client shows a picker dialog
 *   - not-found    — frontmatter present but id doesn't belong to user
 *                    (cross-user or deleted) → returns parsed body for picker
 *
 * Every successful "imported" response also creates a WorkLogVersion via the
 * ADR-0017 auto-snapshot writer, so every re-import is reversible.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { parseFrontmatter } from "@/lib/worklog/export/frontmatter";
import { decideImport } from "@/lib/worklog/import/grill-frontmatter";
import { importMarkdown } from "@/lib/worklog/import/markdown-to-pm";
import { validateContentJson } from "@/lib/worklog/content-json";
import {
  extractMentionAssetIds,
  extractMentionEntityIds,
} from "@/lib/worklog/prosemirror-to-text";
import { arraysEqualAsSets } from "@/lib/array-set-equal";
import {
  shouldAutoSnapshot,
  computeRetentionPlan,
} from "@/lib/worklog/version/snapshot";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024; // 5 MB — same as the existing import route

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return badRequest("Unauthorized", 401);

  let body: { source?: unknown };
  try {
    body = (await request.json()) as { source?: unknown };
  } catch {
    return badRequest("Invalid JSON body");
  }

  const source = body.source;
  if (typeof source !== "string" || source.length === 0) {
    return badRequest("source is required and must be a non-empty string");
  }
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return badRequest(`source exceeds ${MAX_SOURCE_BYTES} bytes (5 MB cap)`, 413);
  }

  // ── 1. Parse frontmatter ─────────────────────────────────────────────────
  const { frontmatter, body: markdownBody } = parseFrontmatter(source);

  // ── 2. Decide route. Cheap path when frontmatter is missing — no DB. ──────
  if (!frontmatter) {
    const parsed = importMarkdown(markdownBody);
    return NextResponse.json({
      status: "needs-picker",
      reason: "no-frontmatter",
      fileBody: parsed,
    });
  }

  // Frontmatter present — owner-scoped lookup.
  const owned = await prisma.workLog.findFirst({
    where: { id: frontmatter.id, userId },
    select: {
      id: true,
      title: true,
      content: true,
      contentJson: true,
      linkedNoteIds: true,
      assetIds: true,
    },
  });

  let versionCount = 0;
  if (owned) {
    versionCount = await prisma.workLogVersion.count({
      where: { workLogId: frontmatter.id },
    });
  }

  const decision = decideImport({
    parsedFrontmatter: frontmatter,
    workLogExists: !!owned,
    currentVersionCount: versionCount,
  });

  // Always parse the body for the response (used by every branch).
  const parsedBody = importMarkdown(markdownBody);

  if (decision.kind === "needs-picker" || decision.kind === "not-found") {
    return NextResponse.json({
      status: decision.kind,
      ...(decision.kind === "not-found"
        ? { attemptedId: decision.attemptedId }
        : { reason: decision.reason }),
      fileBody: parsedBody,
    });
  }

  if (decision.kind === "conflict") {
    return NextResponse.json({
      status: "conflict",
      workLogId: decision.workLogId,
      fileVersion: decision.fileVersion,
      currentVersion: decision.currentVersion,
      fileBody: parsedBody,
      serverBody: {
        title: owned!.title,
        plainText: owned!.content ?? "",
        contentJson: owned!.contentJson,
      },
    });
  }

  // decision.kind === "match" — write the file body to the worklog.
  return performMatchWrite({
    userId,
    workLog: owned!,
    parsedBody,
    frontmatter,
  });
}

// ─────────────────────────────────────────────────────────
// Match write path (Prisma update + auto-snapshot)
// ─────────────────────────────────────────────────────────

async function performMatchWrite(args: {
  userId: string;
  workLog: {
    id: string;
    title: string;
    content: string | null;
    contentJson: unknown;
    linkedNoteIds: string[];
    assetIds: string[];
  };
  parsedBody: ReturnType<typeof importMarkdown>;
  frontmatter: { id: string; title?: string };
}) {
  const { userId, workLog, parsedBody, frontmatter } = args;

  // Validate the freshly-parsed contentJson before writing.
  const validated = validateContentJson(parsedBody.contentJson);
  if (!validated.ok) {
    return NextResponse.json(
      { status: "error", error: validated.error },
      { status: 400 },
    );
  }
  const contentJson = validated.value;

  // Mention-derived columns. Mirror the PUT route's invariants exactly:
  //   - assetIds = additive merge (mentions only ADD)
  //   - linkedNoteIds = replacement, with self-loop guard
  const newMentionAssets = extractMentionAssetIds(contentJson);
  const mergedAssetIds = Array.from(
    new Set([...workLog.assetIds, ...newMentionAssets]),
  );
  const writeAssetIds = !arraysEqualAsSets(mergedAssetIds, workLog.assetIds);

  const newLinkedNoteIds = extractMentionEntityIds(contentJson, "worklog").filter(
    (entityId) => entityId !== workLog.id,
  );
  const writeLinkedNoteIds = !arraysEqualAsSets(
    newLinkedNoteIds,
    workLog.linkedNoteIds,
  );

  // Choose the title: frontmatter title wins, fallback to parsed result.
  const nextTitle =
    frontmatter.title?.trim() || parsedBody.title || workLog.title;

  await prisma.workLog.update({
    where: { id: workLog.id },
    data: {
      title: nextTitle,
      content: parsedBody.plaintext,
      contentJson,
      ...(writeAssetIds ? { assetIds: mergedAssetIds } : {}),
      ...(writeLinkedNoteIds ? { linkedNoteIds: newLinkedNoteIds } : {}),
    },
  });

  // ── ADR-0017 auto-snapshot — best-effort, never fails the user's import ──
  let snapshotCreated = false;
  try {
    const latestVersion = await prisma.workLogVersion.findFirst({
      where: { workLogId: workLog.id },
      orderBy: { createdAt: "desc" },
      select: { plainText: true, createdAt: true },
    });
    const prevPlainText: string =
      latestVersion?.plainText ?? workLog.content ?? "";
    const fire = shouldAutoSnapshot({
      prevPlainText,
      currPlainText: parsedBody.plaintext,
      lastSnapshotAt: latestVersion?.createdAt ?? null,
      now: new Date(),
    });
    if (fire) {
      await prisma.workLogVersion.create({
        data: {
          workLogId: workLog.id,
          userId,
          contentJson,
          plainText: parsedBody.plaintext,
          isManual: false,
          label: "Re-imported via Grill Me",
        },
      });
      snapshotCreated = true;

      // Inline retention thinning — only after a new snapshot lands.
      const rows = await prisma.workLogVersion.findMany({
        where: { workLogId: workLog.id },
        select: { id: true, createdAt: true, isManual: true },
      });
      const plan = computeRetentionPlan({ versions: rows, now: new Date() });
      if (plan.delete.length > 0) {
        await prisma.workLogVersion.deleteMany({
          where: { id: { in: plan.delete } },
        });
      }
    }
  } catch (snapErr) {
    // Snapshot is non-critical. The user's body has been written above.
    console.error("[grill-me] auto-snapshot write failed", snapErr);
  }

  return NextResponse.json({
    status: "imported",
    workLogId: workLog.id,
    snapshotCreated,
    droppedBlocks: parsedBody.droppedBlocks,
  });
}
