import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/* ── GET  /api/map-drawings ── list all drawings + layers ── */
export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [layers, drawings] = await Promise.all([
    prisma.mapDrawingLayer.findMany({
      where: { userId },
      orderBy: { order: "asc" },
    }),
    prisma.mapDrawing.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({ layers, drawings });
}

/* ── POST /api/map-drawings ── create a drawing ── */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type, data, color, zoneType, label, layerId, visible, scope } = body;

  if (!type || !data)
    return NextResponse.json({ error: "type and data are required" }, { status: 400 });

  const drawing = await prisma.mapDrawing.create({
    data: {
      userId,
      type,
      data,
      color: color ?? "#3B82F6",
      zoneType: zoneType ?? null,
      label: label ?? null,
      layerId: layerId ?? null,
      visible: visible ?? true,
      scope: scope ?? "global",
    },
  });

  return NextResponse.json(drawing, { status: 201 });
}

/* ── DELETE /api/map-drawings?id=xxx ── delete a single drawing ── */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Verify ownership before deleting
  const drawing = await prisma.mapDrawing.findFirst({
    where: { id, userId },
  });
  if (!drawing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mapDrawing.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
