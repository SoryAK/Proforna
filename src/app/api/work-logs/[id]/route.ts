import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

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
    const body = await request.json();

    const existing = await prisma.workLog.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const log = await prisma.workLog.update({
      where: { id },
      data: {
        date: body.date ? new Date(body.date) : undefined,
        title: body.title,
        content: body.content ?? null,
        category: body.category || "task",
        hours: body.hours != null && body.hours !== "" ? parseFloat(String(body.hours)) : null,
        tags: body.tags ?? null,
        accomplishment: body.accomplishment ?? false,
        impact: body.impact ?? null,
        positionId: body.positionId === undefined ? undefined : (body.positionId || null),
        isNotable: body.isNotable ?? undefined,
        mood: body.mood === undefined ? undefined : (body.mood || null),
        equipmentIds: Array.isArray(body.equipmentIds) ? body.equipmentIds : undefined,
        assetIds: Array.isArray(body.assetIds) ? body.assetIds : undefined,
      },
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
