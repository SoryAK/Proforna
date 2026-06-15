import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { validateCareerEventInput } from "@/lib/career-event/event-schema";

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

  // URL `id` is authoritative for anchored events — overrides any caller-supplied
  // workHistoryId. Validator handles shape + cross-field rules in one pass.
  const validation = validateCareerEventInput({ ...body, workHistoryId: id });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const v = validation.value;

  // skillNodeIds is a relation, not part of the input shape — pull it from body.
  const skillNodeIds = (body as { skillNodeIds?: unknown }).skillNodeIds;

  // Verify ownership
  const wh = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!wh) return NextResponse.json({ error: "Work history not found" }, { status: 404 });

  const event = await prisma.careerEvent.create({
    data: {
      userId,
      workHistoryId: id,
      title: v.title,
      description: v.description,
      category: v.category,
      startDate: v.startDate,
      endDate: v.endDate,
      location: v.location,
      lat: v.lat,
      lng: v.lng,
      metrics: v.metrics,
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
