import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searches = await prisma.marketSearch.findMany({ where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(searches);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const search = await prisma.marketSearch.create({
    data: { userId,
      seriesId: data.seriesId,
      title: data.title,
      occupation: data.occupation || null,
      area: data.area || null,
      dataType: data.dataType || "wages",
      lastData: data.lastData ? JSON.stringify(data.lastData) : null,
      lastFetchedAt: data.lastData ? new Date() : null,
    },
  });
  await logActivity("market_search", search.id, "created", `Saved search: ${search.title}`);
  return NextResponse.json(search, { status: 201 });
}
