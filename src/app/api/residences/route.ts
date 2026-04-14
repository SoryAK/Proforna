import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.residence.findMany({
    where: { userId },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { label, address, lat, lng, placeId, startDate, endDate, isCurrent } = body;

  if (!label || !address || lat == null || lng == null) {
    return NextResponse.json({ error: "label, address, lat, lng are required" }, { status: 400 });
  }

  // If marking as current, unset any other current residence
  if (isCurrent) {
    await prisma.residence.updateMany({
      where: { userId, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  const item = await prisma.residence.create({
    data: {
      userId,
      label: String(label).slice(0, 200),
      address: String(address).slice(0, 500),
      lat: Number(lat),
      lng: Number(lng),
      placeId: placeId ? String(placeId) : null,
      startDate: startDate ? String(startDate).slice(0, 7) : null,
      endDate: endDate ? String(endDate).slice(0, 7) : null,
      isCurrent: !!isCurrent,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
