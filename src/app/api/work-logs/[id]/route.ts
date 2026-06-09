import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { computeWorkdayDateLocal, localDateAndMinuteFromIso } from "@/lib/worklog-shifts";
import { validateContentJson } from "@/lib/worklog/content-json";
import {
  extractMentionAssetIds,
  extractMentionEntityIds,
} from "@/lib/worklog/prosemirror-to-text";
import { arraysEqualAsSets } from "@/lib/array-set-equal";

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
      select: { id: true, positionId: true, date: true, shiftId: true, assetIds: true, linkedNoteIds: true },
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

    // ADR-0016: linkedNoteIds is REPLACEMENT (not additive). The only source
    // is @n: mentions in contentJson, so removing a chip from the doc must
    // remove the link. Self-loop guard filters the current note's own id.
    const linkedNoteIds: string[] | null =
      hasOwn(body, "contentJson") && validatedContentJson
        ? extractMentionEntityIds(validatedContentJson, "worklog").filter(
            (entityId) => entityId !== id,
          )
        : null; // null → contentJson absent, leave column untouched

    const writeLinkedNoteIds: boolean =
      linkedNoteIds !== null && !arraysEqualAsSets(linkedNoteIds, existing.linkedNoteIds);

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
        : {}),
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
      ...(writeLinkedNoteIds ? { linkedNoteIds: linkedNoteIds! } : {}),
      ...(hasOwn(body, "folderId")
        ? { folderId: body.folderId ? String(body.folderId) : null }
        : {}),
    };

    const log = await prisma.workLog.update({
      where: { id },
      data: updateData,
    });

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
