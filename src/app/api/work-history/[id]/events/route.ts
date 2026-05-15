import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** GET — all career events for a work history, with linked skills */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const wh = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!wh) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events = await prisma.careerEvent.findMany({
    where: { workHistoryId: id, userId },
    include: {
      skills: { include: { skillNode: { select: { id: true, name: true, type: true } } } },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { startDate: "asc" },
  });
  // Ensure lat/lng are included in the response (Prisma includes all fields by default)
  return NextResponse.json(events);
}

/** POST — create a career event, optionally linking skills */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, description, category, startDate, endDate, metrics, location, lat, lng, skillNodeIds } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Verify ownership
  const wh = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!wh) return NextResponse.json({ error: "Work history not found" }, { status: 404 });

  const validCategories = [
    // legacy
    "project", "milestone", "responsibility", "training", "outcome", "context_shift",
    // "things you participated in"
    "company_event", "field_day", "emergency", "news_event", "social", "conference", "other",
  ];
  const cat = validCategories.includes(category) ? category : "company_event";

  const event = await prisma.careerEvent.create({
    data: {
      userId,
      workHistoryId: id,
      title: String(title).trim().slice(0, 200),
      description: description ? String(description).slice(0, 2000) : null,
      category: cat,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      location: location ? String(location).slice(0, 200) : null,
      lat: typeof lat === "number" ? lat : null,
      lng: typeof lng === "number" ? lng : null,
      metrics: metrics ? String(metrics).slice(0, 500) : null,
      skills: {
        create: Array.isArray(skillNodeIds)
          ? skillNodeIds
              .filter((sid: unknown) => typeof sid === "string" && sid.length > 0)
              .slice(0, 20)
              .map((sid: string) => ({ skillNodeId: sid }))
          : [],
      },
    },
    include: {
      skills: { include: { skillNode: { select: { id: true, name: true, type: true } } } },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  return NextResponse.json(event, { status: 201 });
}
