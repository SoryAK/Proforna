import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET - list all life anchors for the user
export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const anchors = await prisma.lifeAnchor.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(anchors);
}

// POST - create a new life anchor
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { label, icon, address, lat, lng, weight, sortOrder } = body;

  if (!label || !address || lat == null || lng == null) {
    return NextResponse.json(
      { error: "label, address, lat, lng are required" },
      { status: 400 },
    );
  }

  const anchor = await prisma.lifeAnchor.create({
    data: {
      userId,
      label,
      icon: icon ?? "home",
      address,
      lat: Number(lat),
      lng: Number(lng),
      weight: Math.max(1, Math.min(5, Number(weight) || 3)),
      sortOrder: sortOrder ?? 0,
    },
  });
  return NextResponse.json(anchor, { status: 201 });
}
