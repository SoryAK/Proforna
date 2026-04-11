import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// PATCH - update a life anchor
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.lifeAnchor.findFirst({
    where: { id, userId },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const allowed = ["label", "icon", "address", "lat", "lng", "weight", "sortOrder", "placeId"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "weight") data[key] = Math.max(1, Math.min(5, Number(body[key]) || 3));
      else if (key === "lat" || key === "lng") data[key] = Number(body[key]);
      else data[key] = body[key];
    }
  }

  const updated = await prisma.lifeAnchor.update({
    where: { id },
    data,
  });
  return NextResponse.json(updated);
}

// DELETE - remove a life anchor
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.lifeAnchor.findFirst({
    where: { id, userId },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.lifeAnchor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
