import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { computeWorkdayDateLocal, localDateAndMinuteFromIso } from "@/lib/worklog-shifts";
import { validateContentJson } from "@/lib/worklog/content-json";
import {
  extractMentionAssetIds,
  extractMentionEntityIds,
  proseMirrorDocToPlainText,
} from "@/lib/worklog/prosemirror-to-text";
import { arraysEqualAsSets } from "@/lib/array-set-equal";
import { shouldAutoSnapshot, computeRetentionPlan } from "@/lib/worklog/version/snapshot";

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

type ShiftRow = {
  id: string;
  workHistoryId: string;
  startMinute: number;
  endMinute: number;
};

function deriveWorkdayIso(dateIso: string, shift: ShiftRow | null) {
  const { localDate, minuteOfDay } = localDateAndMinuteFromIso(dateIso);
  const workday = computeWorkdayDateLocal(
    localDate,
    minuteOfDay,
    shift ? { startMinute: shift.startMinute, endMinute: shift.endMinute } : null,
  );
  return new Date(`${workday}T00:00:00`).toISOString();
}

// PUT — update a work log entry (must be owned by the signed-in user)
export async function PUT(
  request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const existing = await prisma.workLog.findFirst({
      where: { id, userId },
      select: { id: true, positionId: true, date: true, shiftId: true, assetIds: true, linkedWorkLogIds: true, linkedContactIds: true, content: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let validatedContentJson: ReturnType<typeof validateContentJson>["value"] | undefined;
    if (hasOwn(body, "contentJson")) {
      const result = validateContentJson(body.contentJson);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      validatedContentJson = result.value;
    }

    // ADR-0026 — archive bucket. Client sends `{ archived: true | false }`;
    // server clamps the timestamp so client clock skew can't drift archive
    // ordering. Anything other than a boolean is a 400.
    let archivedAtUpdate: Date | null | undefined; // undefined = leave column untouched
    if (hasOwn(body, "archived")) {
      if (typeof body.archived !== "boolean") {
        return NextResponse.json(
          { error: "`archived` must be a boolean" },
          { status: 400 },
        );
      }
      archivedAtUpdate = body.archived ? new Date() : null;
    }

    // When contentJson is being saved, union any @a: mention asset IDs into
    // assetIds so the structured tag always reflects inline references.
    // Mentions only ever ADD — manual accordion entries are never removed.
    const mentionAssetIds: string[] =
      hasOwn(body, "contentJson") && validatedContentJson
        ? extractMentionAssetIds(validatedContentJson)
        : [];

    // Base: explicit body.assetIds if the client sent them; otherwise keep existing.
    const baseAssetIds: string[] =
      hasOwn(body, "assetIds") && Array.isArray(body.assetIds)
        ? (body.assetIds as unknown[]).filter((v): v is string => typeof v === "string")
        : existing.assetIds;

    const mergedAssetIds: string[] | null =
      hasOwn(body, "assetIds") || mentionAssetIds.length > 0
        ? Array.from(new Set([...baseAssetIds, ...mentionAssetIds]))
        : null; // null → leave assetIds column untouched

    // ADR-0016: skip-if-equal guard — don't write the GIN-indexed column when
    // the resulting set matches what's already stored. Saves an index write
    // on every autosave that didn't touch mentions.
    const writeAssetIds: boolean =
      mergedAssetIds !== null && !arraysEqualAsSets(mergedAssetIds, existing.assetIds);

    // ADR-0016 (origin) + ADR-0029 P0-#1 (kind-agnostic widening):
    // linkedWorkLogIds is REPLACEMENT (not additive). The source is the
    // union of @n: (worklog/note) AND @r: (procedure) mentions in
    // contentJson — procedures and notes are the same WorkLog model under
    // the `kind` discriminator, so a single column answers "what mentions
    // this worklog" for any kind. Self-loop guard filters the current
    // worklog's own id regardless of which mention type was used.
    const linkedWorkLogIds: string[] | null =
      hasOwn(body, "contentJson") && validatedContentJson
        ? Array.from(
            new Set([
              ...extractMentionEntityIds(validatedContentJson, "worklog"),
              ...extractMentionEntityIds(validatedContentJson, "procedure"),
            ]),
          ).filter((entityId) => entityId !== id)
        : null; // null → contentJson absent, leave column untouched

    const writeLinkedWorkLogIds: boolean =
      linkedWorkLogIds !== null && !arraysEqualAsSets(linkedWorkLogIds, existing.linkedWorkLogIds);

    // ADR-0028: linkedContactIds is REPLACEMENT (mirror linkedWorkLogIds — there
    // is no manual contact UI seam on a WorkLog, so the @p: chip in
    // contentJson IS the only link source). No self-loop guard needed —
    // contacts and worklogs are different entity types.
    const linkedContactIds: string[] | null =
      hasOwn(body, "contentJson") && validatedContentJson
        ? extractMentionEntityIds(validatedContentJson, "contact")
        : null; // null → contentJson absent, leave column untouched

    const writeLinkedContactIds: boolean =
      linkedContactIds !== null &&
      !arraysEqualAsSets(linkedContactIds, existing.linkedContactIds);

    const nextPositionId = hasOwn(body, "positionId")
      ? (body.positionId ? String(body.positionId) : null)
      : existing.positionId;

    let shift: ShiftRow | null = null;
    if (hasOwn(body, "shiftId")) {
      const incoming = body.shiftId ? String(body.shiftId) : null;
      if (incoming) {
        shift = await prisma.workHistoryShift.findFirst({
          where: { id: incoming, userId, isActive: true },
          select: { id: true, workHistoryId: true, startMinute: true, endMinute: true },
        });
        if (!shift) {
          return NextResponse.json({ error: "Shift not found" }, { status: 404 });
        }
        if (nextPositionId && shift.workHistoryId !== nextPositionId) {
          return NextResponse.json({ error: "Shift does not belong to selected job" }, { status: 400 });
        }
      }
    } else if (existing.shiftId) {
      shift = await prisma.workHistoryShift.findFirst({
        where: { id: existing.shiftId, userId, isActive: true },
        select: { id: true, workHistoryId: true, startMinute: true, endMinute: true },
      });
    }

    // Validate folder ownership when moving. `null` removes the note from
    // any folder (Unfiled). Omitting the field leaves placement unchanged.
    if (hasOwn(body, "folderId") && body.folderId) {
      const folder = await prisma.workLogFolder.findFirst({
        where: { id: String(body.folderId), userId },
        select: { id: true },
      });
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
    }

    const nextDateIso = hasOwn(body, "date") && body.date
      ? new Date(String(body.date)).toISOString()
      : existing.date.toISOString();

    const derivedWorkdayIso = deriveWorkdayIso(nextDateIso, shift);

    const updateData = {
      ...(hasOwn(body, "date") ? { date: body.date ? new Date(String(body.date)) : undefined } : {}),
      ...(hasOwn(body, "title") ? { title: body.title } : {}),
      ...(hasOwn(body, "content") ? { content: body.content ?? null } : {}),
      ...(hasOwn(body, "contentJson")
        ? { contentJson: validatedContentJson ?? undefined }
        : {}),
      ...(hasOwn(body, "category") ? { category: body.category || "task" } : {}),
      ...(hasOwn(body, "hours")
        ? { hours: body.hours != null && body.hours !== "" ? parseFloat(String(body.hours)) : null }
        : {}),
      ...(hasOwn(body, "tags") ? { tags: body.tags ?? null } : {}),
      ...(hasOwn(body, "accomplishment") ? { accomplishment: body.accomplishment ?? false } : {}),
      ...(hasOwn(body, "impact") ? { impact: body.impact ?? null } : {}),
      ...(hasOwn(body, "positionId")
        ? { positionId: body.positionId === undefined ? undefined : (body.positionId || null) }
        : {}),
      ...(hasOwn(body, "shiftId")
        ? { shiftId: body.shiftId ? String(body.shiftId) : null }
        : writeLinkedContactIds ? { linkedContactIds: linkedContactIds! } : {}),
      ...({}),
      ...(hasOwn(body, "workdayDate")
        ? { workdayDate: body.workdayDate ? new Date(String(body.workdayDate)) : new Date(derivedWorkdayIso) }
        : hasOwn(body, "date") || hasOwn(body, "shiftId") || hasOwn(body, "positionId")
          ? { workdayDate: new Date(derivedWorkdayIso) }
          : {}),
      ...(hasOwn(body, "isNotable") ? { isNotable: body.isNotable ?? undefined } : {}),
      ...(hasOwn(body, "mood") ? { mood: body.mood === undefined ? undefined : (body.mood || null) } : {}),
      ...(hasOwn(body, "equipmentIds")
        ? { equipmentIds: Array.isArray(body.equipmentIds) ? body.equipmentIds : undefined }
        : {}),
      ...(writeAssetIds ? { assetIds: mergedAssetIds! } : {}),
      ...(writeLinkedWorkLogIds ? { linkedWorkLogIds: linkedWorkLogIds! } : {}),
      ...(hasOwn(body, "folderId")
        ? { folderId: body.folderId ? String(body.folderId) : null }
        : {}),
      ...(archivedAtUpdate !== undefined ? { archivedAt: archivedAtUpdate } : {}),
    };

    const log = await prisma.workLog.update({
      where: { id },
      data: updateData,
    });

    // ── ADR-0017 — auto-snapshot writer ────────────────────────────────────
    // Best-effort: a failure here must NEVER fail the user's save. The
    // heuristic + retention helpers live in src/lib/worklog/version/snapshot.ts;
    // this block is the I/O wrapper that calls them with live prisma state.
    if (hasOwn(body, "contentJson") && validatedContentJson) {
      try {
        const currPlainText = proseMirrorDocToPlainText(validatedContentJson);
        const latestVersion = await prisma.workLogVersion.findFirst({
          where: { workLogId: id },
          orderBy: { createdAt: "desc" },
          select: { plainText: true, createdAt: true },
        });
        const prevPlainText: string =
          latestVersion?.plainText ?? existing.content ?? "";
        const fire = shouldAutoSnapshot({
          prevPlainText,
          currPlainText,
          lastSnapshotAt: latestVersion?.createdAt ?? null,
          now: new Date(),
        });
        if (fire) {
          await prisma.workLogVersion.create({
            data: {
              workLogId: id,
              userId,
              contentJson: validatedContentJson,
              plainText: currPlainText,
              isManual: false,
              label: null,
            },
          });

          // ── Inline retention thinning (ADR-0017 kickoff Q2: cheap guard) ──
          // Only thin AFTER a new snapshot lands. This skips the SELECT on
          // every autosave that didn't trigger the heuristic — the cheap
          // path is "no snapshot, no scan."
          const rows = await prisma.workLogVersion.findMany({
            where: { workLogId: id },
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
        // Snapshot is non-critical. Log and continue — user's save already
        // landed above, so a snapshot failure must not surface as a 500.
        console.error("[ADR-0017] auto-snapshot write failed", snapErr);
      }
    }

    return NextResponse.json(log);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove a work log entry (must be owned by the signed-in user)
export async function DELETE(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const existing = await prisma.workLog.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.workLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
