import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import {
  CAREER_EVENT_TITLE_MAX,
  CAREER_EVENT_DESCRIPTION_MAX,
  CAREER_EVENT_LOCATION_MAX,
  CAREER_EVENT_METRICS_MAX,
} from "@/lib/career-event/event-schema";

/**
 * Per-event peer route for FREE-FLOATING career events (ADR-0027 Day 2 Cycle B).
 *
 *   PATCH  /api/events/[eventId]    → partial update
 *   DELETE /api/events/[eventId]    → remove
 *
 * Strict scope (Q2=B): every operation includes `workHistoryId: null` in its
 * existence check. If the event is anchored — or owned by another user — the
 * caller gets 404 (no existence leak). Anchored events mutate via
 * `/api/work-history/[id]/events/[eventId]`.
 *
 * Immutability (Q1=A): the route REJECTS any PATCH body that includes a
 * `workHistoryId` key. A free-floating event cannot be re-anchored in place
 * — the caller must delete-and-recreate via the anchored POST. Surfaces
 * buggy clients rather than silently stripping the field.
 *
 * Geo invariant: free-floating rows require lat + lng + location (see
 * validator's cross-field rule). Explicit `null` assignment to any of those
 * three on PATCH would violate the invariant, so we reject it with 400.
 */

const VALID_CATEGORIES = [
  "project",
  "milestone",
  "responsibility",
  "training",
  "outcome",
  "context_shift",
  "company_event",
  "field_day",
  "emergency",
  "news_event",
  "social",
  "conference",
  "other",
];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** PATCH — partial update of a free-floating event. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const body = (await req.json()) as Record<string, unknown>;

  // Q1=A: workHistoryId is immutable on this route family. Even if the body
  // sets it to `null` (no-op), reject — the presence of the key signals a
  // buggy client trying to mutate anchoring.
  if (Object.prototype.hasOwnProperty.call(body, "workHistoryId")) {
    return NextResponse.json(
      { error: "workHistoryId is immutable on /api/events/[eventId] (delete + re-create via /api/work-history/[id]/events to re-anchor)." },
      { status: 400 }
    );
  }

  // Q2=B strict scope: only operates on free-floating events.
  // Anchored or non-owned events return 404 (no existence leak).
  const existing = await prisma.careerEvent.findFirst({
    where: { id: eventId, userId, workHistoryId: null },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Geo invariant: free-floating rows must keep lat + lng + location.
  // Reject explicit `null` assignments. (Updating to a new non-null value
  // is allowed.)
  if (body.lat === null) {
    return NextResponse.json(
      { error: "lat cannot be set to null on a free-floating event." },
      { status: 400 }
    );
  }
  if (body.lng === null) {
    return NextResponse.json(
      { error: "lng cannot be set to null on a free-floating event." },
      { status: 400 }
    );
  }
  if (body.location === null) {
    return NextResponse.json(
      { error: "location cannot be set to null on a free-floating event." },
      { status: 400 }
    );
  }

  // Field-by-field validation for present non-null updates.
  if (body.lat !== undefined && !isFiniteNumber(body.lat)) {
    return NextResponse.json({ error: "lat must be a finite number." }, { status: 400 });
  }
  if (body.lng !== undefined && !isFiniteNumber(body.lng)) {
    return NextResponse.json({ error: "lng must be a finite number." }, { status: 400 });
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json({ error: "title must be a non-empty string." }, { status: 400 });
    }
  }

  const {
    title,
    description,
    category,
    startDate,
    endDate,
    metrics,
    location,
    lat,
    lng,
    skillNodeIds,
  } = body;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.careerEvent.update({
      where: { id: eventId },
      data: {
        ...(title != null && {
          title: String(title).trim().slice(0, CAREER_EVENT_TITLE_MAX),
        }),
        ...(description !== undefined && {
          description: description
            ? String(description).slice(0, CAREER_EVENT_DESCRIPTION_MAX)
            : null,
        }),
        ...(category != null &&
          typeof category === "string" &&
          VALID_CATEGORIES.includes(category) && { category }),
        ...(startDate !== undefined && {
          startDate: startDate ? new Date(startDate as string) : null,
        }),
        ...(endDate !== undefined && {
          endDate: endDate ? new Date(endDate as string) : null,
        }),
        ...(location !== undefined && {
          location: location
            ? String(location).slice(0, CAREER_EVENT_LOCATION_MAX)
            : null,
        }),
        ...(metrics !== undefined && {
          metrics: metrics
            ? String(metrics).slice(0, CAREER_EVENT_METRICS_MAX)
            : null,
        }),
        ...(lat !== undefined && { lat: lat as number }),
        ...(lng !== undefined && { lng: lng as number }),
      },
    });

    if (Array.isArray(skillNodeIds)) {
      await tx.careerEventSkill.deleteMany({
        where: { careerEventId: eventId },
      });
      const validIds = skillNodeIds
        .filter((sid: unknown) => typeof sid === "string" && sid.length > 0)
        .slice(0, 20);
      if (validIds.length > 0) {
        await tx.careerEventSkill.createMany({
          data: validIds.map((sid: string) => ({
            careerEventId: eventId,
            skillNodeId: sid,
          })),
        });
      }
    }

    return tx.careerEvent.findUnique({
      where: { id: eventId },
      include: {
        skills: {
          include: {
            skillNode: { select: { id: true, name: true, type: true } },
          },
        },
        photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
  });

  return NextResponse.json(updated);
}

/** DELETE — remove a free-floating event. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;

  // Q2=B strict scope: anchored events 404 here.
  const existing = await prisma.careerEvent.findFirst({
    where: { id: eventId, userId, workHistoryId: null },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.careerEvent.delete({ where: { id: eventId } });
  return NextResponse.json({ deleted: true });
}
