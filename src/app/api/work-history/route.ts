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
  const { company, title, address, lat, lng, startDate, endDate, placeId, type, degree, major, gpa } = body;

  if (!company || (type !== "unemployed" && (!address || lat == null || lng == null))) {
    return NextResponse.json({ error: "company, address, lat, lng are required" }, { status: 400 });
  }

  const item = await prisma.workHistory.create({
    data: {
      userId,
      type: type ? String(type).slice(0, 20) : "job",
      company: String(company).slice(0, 200),
      title: title ? String(title).slice(0, 200) : null,
      address: address ? String(address).slice(0, 500) : "N/A",
      lat: lat != null ? Number(lat) : 0,
      lng: lng != null ? Number(lng) : 0,
      placeId: placeId ? String(placeId) : null,
      startDate: startDate ? String(startDate).slice(0, 7) : null,
      endDate: endDate ? String(endDate).slice(0, 7) : null,
      degree: degree ? String(degree).slice(0, 100) : null,
      major: major ? String(major).slice(0, 200) : null,
      gpa: gpa != null ? Number(gpa) : null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
