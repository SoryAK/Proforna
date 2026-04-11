import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.workHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { locations: true },
  });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { company, title, address, lat, lng, startDate, endDate, placeId } = body;

  if (!company || !address || lat == null || lng == null) {
    return NextResponse.json({ error: "company, address, lat, lng are required" }, { status: 400 });
  }

  const item = await prisma.workHistory.create({
    data: {
      userId,
      company: String(company).slice(0, 200),
      title: title ? String(title).slice(0, 200) : null,
      address: String(address).slice(0, 500),
      lat: Number(lat),
      lng: Number(lng),
      placeId: placeId ? String(placeId) : null,
      startDate: startDate ? String(startDate).slice(0, 7) : null,
      endDate: endDate ? String(endDate).slice(0, 7) : null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
