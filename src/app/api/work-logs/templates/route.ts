import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — list all worklog templates for the signed-in user
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.workLogTemplate.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { lastUsedAt: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(templates);
}

// POST — create a worklog template
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      name,
      description,
      icon,
      color,
      defaultPositionId,
      defaultCategory,
      defaultTitle,
      defaultTags,
      defaultEquipmentIds,
      defaultAssetIds,
      defaultMood,
      defaultDurationMinutes,
      sortOrder,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (defaultPositionId) {
      const pos = await prisma.workHistory.findFirst({
        where: { id: defaultPositionId, userId },
        select: { id: true },
      });
      if (!pos) return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    const tpl = await prisma.workLogTemplate.create({
      data: {
        userId,
        name: name.trim(),
        description: description || null,
        icon: icon || null,
        color: color || null,
        defaultPositionId: defaultPositionId || null,
        defaultCategory: defaultCategory || "task",
        defaultTitle: defaultTitle || null,
        defaultTags: defaultTags || null,
        defaultEquipmentIds: Array.isArray(defaultEquipmentIds) ? defaultEquipmentIds : [],
        defaultAssetIds: Array.isArray(defaultAssetIds) ? defaultAssetIds : [],
        defaultMood: defaultMood || null,
        defaultDurationMinutes:
          defaultDurationMinutes != null && defaultDurationMinutes !== ""
            ? parseInt(String(defaultDurationMinutes), 10)
            : null,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      },
    });

    return NextResponse.json(tpl, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
