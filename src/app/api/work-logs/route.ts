import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

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

  const where: Record<string, unknown> = { userId };

  if (positionId) {
    where.positionId = positionId;
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
      category,
      hours,
      tags,
      accomplishment,
      impact,
      isNotable,
      mood,
      templateId,
      equipmentIds,
      assetIds,
    } = body;

    if (!date || !title) {
      return NextResponse.json({ error: "date and title are required" }, { status: 400 });
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

    const log = await prisma.workLog.create({
      data: {
        userId,
        positionId: positionId || null,
        date: new Date(date),
        title,
        content: content || null,
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
