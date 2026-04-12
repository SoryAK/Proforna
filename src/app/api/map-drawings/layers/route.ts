import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/* ── GET  /api/map-drawings/layers ── list layers ── */
export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const layers = await prisma.mapDrawingLayer.findMany({
    where: { userId },
    orderBy: { order: "asc" },
    include: { drawings: { select: { id: true } } },
  });

  return NextResponse.json(layers);
}

/* ── POST /api/map-drawings/layers ── create layer ── */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name } = body;

  if (!name || typeof name !== "string")
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  const maxOrder = await prisma.mapDrawingLayer.aggregate({
    where: { userId },
    _max: { order: true },
  });

  const layer = await prisma.mapDrawingLayer.create({
    data: {
      userId,
      name,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  return NextResponse.json(layer, { status: 201 });
}

/* ── DELETE /api/map-drawings/layers?id=xxx ── delete layer ── */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const layer = await prisma.mapDrawingLayer.findFirst({
    where: { id, userId },
  });
  if (!layer)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Drawings in this layer get layerId set to null (SetNull in schema)
  await prisma.mapDrawingLayer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/* ── PATCH /api/map-drawings/layers?id=xxx ── toggle visibility etc ── */
export async function PATCH(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const layer = await prisma.mapDrawingLayer.findFirst({
    where: { id, userId },
  });
  if (!layer)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if ("visible" in body && typeof body.visible === "boolean") updates.visible = body.visible;
  if ("name" in body && typeof body.name === "string") updates.name = body.name;

  const updated = await prisma.mapDrawingLayer.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(updated);
}
