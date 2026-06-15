import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { validateCareerEventInput } from "@/lib/career-event/event-schema";

/**
 * Peer route family for FREE-FLOATING career events (ADR-0027 Day 2 Cycle A).
 *
 *   GET  /api/events                    → all of caller's events
 *   GET  /api/events?floating=true      → only free-floating (workHistoryId IS NULL)
 *   GET  /api/events?floating=false     → only anchored (workHistoryId IS NOT NULL)
 *   POST /api/events                    → create a free-floating event
 *
 * Strict scope (Q2=B): POST forces `workHistoryId: null` regardless of body
 * input. Anchored events must go through `/api/work-history/[id]/events`.
 * The validator's cross-field rule then enforces lat + lng + location.
 */

/** GET — list caller's events, optionally filtered by floating-status. */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use standard URL parsing (not req.nextUrl) so handler is portable to
  // plain `Request` test inputs without depending on Next's runtime wrapper.
  const floatingParam = new URL(req.url).searchParams.get("floating");
  const where: { userId: string; workHistoryId?: null | { not: null } } = { userId };
  if (floatingParam === "true") {
    where.workHistoryId = null;
  } else if (floatingParam === "false") {
    where.workHistoryId = { not: null };
  }

  const events = await prisma.careerEvent.findMany({
    where,
    include: {
      skills: { include: { skillNode: { select: { id: true, name: true, type: true } } } },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json(events);
}

/** POST — create a free-floating event (workHistoryId forced to null). */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Defense-in-depth: peer route is for free-floating events only.
  // Even if caller smuggles a workHistoryId, force null. Validator's
  // cross-field rule then enforces lat + lng + location.
  const validation = validateCareerEventInput({ ...body, workHistoryId: null });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const v = validation.value;

  const skillNodeIds = (body as { skillNodeIds?: unknown }).skillNodeIds;

  const event = await prisma.careerEvent.create({
    data: {
      userId,
      workHistoryId: null,
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
