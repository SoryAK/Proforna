import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — list all saved searches for current user
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searches = await prisma.savedSearch.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(searches);
}

// POST — create a new saved search
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, query, location, radius, source, lat, lng, filters } = body;

  if (!name?.trim() || !location?.trim()) {
    return NextResponse.json({ error: "name and location are required" }, { status: 400 });
  }

  const search = await prisma.savedSearch.create({
    data: {
      userId,
      name: name.trim(),
      query: query?.trim() ?? "",
      location: location.trim(),
      radius: radius ?? "25",
      source: source ?? "both",
      lat: lat ?? null,
      lng: lng ?? null,
      filters: filters ? JSON.stringify(filters) : null,
      lastRunAt: new Date(),
    },
  });

  return NextResponse.json(search, { status: 201 });
}
