import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/skill-graph/occupations/[id]
 *
 * Returns a single occupation with requirements + user interest.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const occupation = await prisma.occupation.findFirst({
    where: { id, userId },
    include: {
      requirements: {
        include: {
          skillNode: { select: { id: true, name: true, type: true } },
        },
        orderBy: { importance: "desc" },
      },
      interests: { where: { userId }, take: 1 },
    },
  });

  if (!occupation) {
    return NextResponse.json({ error: "Occupation not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...occupation,
    interest: occupation.interests[0] ?? null,
    interests: undefined,
  });
}

/**
 * PATCH /api/skill-graph/occupations/[id]
 *
 * Update occupation fields or set user interest/status.
 * Body: { title?, description?, status?, notes? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, description, status, notes } = body;

  // Verify ownership
  const occupation = await prisma.occupation.findFirst({
    where: { id, userId },
    select: { id: true, title: true },
  });

  if (!occupation) {
    return NextResponse.json({ error: "Occupation not found" }, { status: 404 });
  }

  // Update occupation fields if provided
  if (title || description !== undefined) {
    await prisma.occupation.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
  }

  // Upsert interest/status if provided
  if (status) {
    const validStatuses = ["current", "target", "past", "exploring"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    await prisma.userOccupationInterest.upsert({
      where: { userId_occupationId: { userId, occupationId: id } },
      update: { status, notes: notes ?? undefined },
      create: { userId, occupationId: id, status, notes: notes ?? null },
    });
  }

  await logActivity("skill_graph", userId, "occupation_updated", `Updated occupation: ${occupation.title}`);

  return NextResponse.json({ updated: true });
}

/**
 * DELETE /api/skill-graph/occupations/[id]
 *
 * Delete an occupation (cascades requirements + interest).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const occupation = await prisma.occupation.findFirst({
    where: { id, userId },
    select: { id: true, title: true },
  });

  if (!occupation) {
    return NextResponse.json({ error: "Occupation not found" }, { status: 404 });
  }

  await prisma.occupation.delete({ where: { id } });

  await logActivity("skill_graph", userId, "occupation_deleted", `Deleted occupation: ${occupation.title}`);

  return NextResponse.json({ deleted: true });
}
