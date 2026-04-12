import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/* ── PATCH /api/map-drawings/[id] ── update a drawing ── */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const drawing = await prisma.mapDrawing.findFirst({
    where: { id, userId },
  });
  if (!drawing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["data", "color", "zoneType", "label", "layerId", "visible", "locked", "type", "scope"] as const;
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = body[k];
  }

  const updated = await prisma.mapDrawing.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(updated);
}
