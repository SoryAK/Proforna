import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { computeWorkdayDateLocal, localDateAndMinuteFromIso } from "@/lib/worklog-shifts";
import { validateContentJson } from "@/lib/worklog/content-json";

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

// GET — list work logs.
//   • If `positionId` is provided → return logs for that position (legacy per-position usage).
//   • If `positionId` is omitted → return ALL logs for the signed-in user (Phase A daily-ritual view).
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");
  const accomplishments = searchParams.get("accomplishments");
  const notable = searchParams.get("notable");
  const templateId = searchParams.get("templateId");
  const equipmentId = searchParams.get("equipmentId");
  const folderIdParam = searchParams.get("folderId");
  // ADR-0026 — archive bucket. Locked contract:
  //   ?archived=only → archivedAt IS NOT NULL
  //   ?archived=all  → no predicate (both buckets)
  //   absent / other → archivedAt IS NULL (Gmail-style default hide)
  const archivedParam = searchParams.get("archived");

  const where: Record<string, unknown> = { userId };

  if (positionId) {
    where.positionId = positionId;
  }
  if (archivedParam === "only") {
    where.archivedAt = { not: null };
  } else if (archivedParam !== "all") {
    where.archivedAt = null;
  }
  // folderId filter — pass an actual id, or the literal string "null" / "unfiled"
  // to select notes that don't belong to any folder.
  if (folderIdParam) {
    if (folderIdParam === "null" || folderIdParam === "unfiled") {
      where.folderId = null;
    } else {
      where.folderId = folderIdParam;
    }
  }
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  if (category && category !== "all") {
    where.category = category;
  }
  if (accomplishments === "true") {
    where.accomplishment = true;
  }
  if (notable === "true") {
    where.isNotable = true;
  }
  if (templateId) {
    where.templateId = templateId;
  }
  if (equipmentId) {
    where.equipmentIds = { has: equipmentId };
  }
  const assetId = searchParams.get("assetId");
  if (assetId) {
    where.assetIds = { has: assetId };
  }

  const logs = await prisma.workLog.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      shift: {
        select: { id: true, name: true, startMinute: true, endMinute: true },
      },
      photos: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, filePath: true, caption: true },
      },
    },
  });

  return NextResponse.json(logs);
}

// POST — create a work log entry. `positionId` is optional (standalone "general day" entries are allowed).
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      positionId,
      date,
      title,
      content,
      contentJson,
      category,
      hours,
      tags,
      accomplishment,
      impact,
      isNotable,
      mood,
      templateId,
      shiftId,
      workdayDate,
      equipmentIds,
      assetIds,
      folderId,
    } = body;

    if (!date || !title) {
      return NextResponse.json({ error: "date and title are required" }, { status: 400 });
    }

    const contentJsonResult = validateContentJson(contentJson);
    if (!contentJsonResult.ok) {
      return NextResponse.json({ error: contentJsonResult.error }, { status: 400 });
    }

    // If positionId is provided, verify it belongs to this user.
    if (positionId) {
      const position = await prisma.workHistory.findFirst({
        where: { id: positionId, userId },
        select: { id: true },
      });
      if (!position) {
        return NextResponse.json({ error: "Position not found" }, { status: 404 });
      }
    }

    // If templateId is provided, verify it belongs to this user.
    if (templateId) {
      const template = await prisma.workLogTemplate.findFirst({
        where: { id: templateId, userId },
        select: { id: true },
      });
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
    }

    let shift: ShiftRow | null = null;
    if (shiftId) {
      shift = await prisma.workHistoryShift.findFirst({
        where: { id: shiftId, userId, isActive: true },
        select: { id: true, workHistoryId: true, startMinute: true, endMinute: true },
      });
      if (!shift) {
        return NextResponse.json({ error: "Shift not found" }, { status: 404 });
      }
      if (positionId && shift.workHistoryId !== positionId) {
        return NextResponse.json({ error: "Shift does not belong to selected job" }, { status: 400 });
      }
    }

    // Validate folderId ownership if provided.
    if (folderId) {
      const folder = await prisma.workLogFolder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
      });
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
    }

    const dateIso = new Date(date).toISOString();
    const derivedWorkdayIso = deriveWorkdayIso(dateIso, shift);

    const log = await prisma.workLog.create({
      data: {
        userId,
        positionId: positionId || null,
        shiftId: shift?.id ?? null,
        date: new Date(dateIso),
        workdayDate: workdayDate ? new Date(workdayDate) : new Date(derivedWorkdayIso),
        title,
        content: content || null,
        contentJson: contentJsonResult.value ?? undefined,
        category: category || "task",
        hours: hours != null && hours !== "" ? parseFloat(String(hours)) : null,
        tags: tags || null,
        accomplishment: accomplishment ?? false,
        impact: impact || null,
        isNotable: isNotable ?? false,
        mood: mood || null,
        templateId: templateId || null,
        equipmentIds: Array.isArray(equipmentIds) ? equipmentIds : [],
        assetIds: Array.isArray(assetIds) ? assetIds : [],
        folderId: folderId || null,
      },
    });

    // Bump template usage stats (best-effort; ignore failures)
    if (templateId) {
      prisma.workLogTemplate
        .update({
          where: { id: templateId },
          data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
        })
        .catch(() => {});
    }

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
