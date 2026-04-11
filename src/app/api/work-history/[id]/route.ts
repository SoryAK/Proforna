import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.company != null) data.company = String(body.company).slice(0, 200);
  if (body.title !== undefined) data.title = body.title ? String(body.title).slice(0, 200) : null;
  if (body.address != null) data.address = String(body.address).slice(0, 500);
  if (body.lat != null) data.lat = Number(body.lat);
  if (body.lng != null) data.lng = Number(body.lng);
  if (body.startDate !== undefined) data.startDate = body.startDate ? String(body.startDate).slice(0, 7) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? String(body.endDate).slice(0, 7) : null;
  if (body.placeId !== undefined) data.placeId = body.placeId ? String(body.placeId) : null;

  const updated = await prisma.workHistory.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.workHistory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
