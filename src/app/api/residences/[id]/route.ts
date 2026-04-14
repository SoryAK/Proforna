import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { label, address, lat, lng, placeId, startDate, endDate, isCurrent } = body;

  // Verify ownership
  const existing = await prisma.residence.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If marking as current, unset any other current residence
  if (isCurrent) {
    await prisma.residence.updateMany({
      where: { userId, isCurrent: true, id: { not: id } },
      data: { isCurrent: false },
    });
  }

  const updated = await prisma.residence.update({
    where: { id },
    data: {
      ...(label !== undefined && { label: String(label).slice(0, 200) }),
      ...(address !== undefined && { address: String(address).slice(0, 500) }),
      ...(lat != null && { lat: Number(lat) }),
      ...(lng != null && { lng: Number(lng) }),
      ...(placeId !== undefined && { placeId: placeId ? String(placeId) : null }),
      ...(startDate !== undefined && { startDate: startDate ? String(startDate).slice(0, 7) : null }),
      ...(endDate !== undefined && { endDate: endDate ? String(endDate).slice(0, 7) : null }),
      ...(isCurrent !== undefined && { isCurrent: !!isCurrent }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.residence.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.residence.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
