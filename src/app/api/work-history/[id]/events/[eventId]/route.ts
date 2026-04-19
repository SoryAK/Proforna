import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/** PATCH — update a career event */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;
  const body = await req.json();
  const { title, description, category, startDate, endDate, metrics, skillNodeIds } = body;

  // Verify ownership
  const existing = await prisma.careerEvent.findFirst({
    where: { id: eventId, workHistoryId: id, userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const validCategories = ["project", "milestone", "responsibility", "training", "outcome", "context_shift"];

  const updated = await prisma.$transaction(async (tx) => {
    // Update the event itself
    const event = await tx.careerEvent.update({
      where: { id: eventId },
      data: {
        ...(title != null && { title: String(title).trim().slice(0, 200) }),
        ...(description !== undefined && { description: description ? String(description).slice(0, 2000) : null }),
        ...(category != null && validCategories.includes(category) && { category }),
        ...(startDate !== undefined && { startDate: startDate ? String(startDate).slice(0, 7) : null }),
        ...(endDate !== undefined && { endDate: endDate ? String(endDate).slice(0, 7) : null }),
        ...(metrics !== undefined && { metrics: metrics ? String(metrics).slice(0, 500) : null }),
      },
    });

    // If skillNodeIds provided, replace all skill links
    if (Array.isArray(skillNodeIds)) {
      await tx.careerEventSkill.deleteMany({ where: { careerEventId: eventId } });
      const validIds = skillNodeIds
        .filter((sid: unknown) => typeof sid === "string" && sid.length > 0)
        .slice(0, 20);
      if (validIds.length > 0) {
        await tx.careerEventSkill.createMany({
          data: validIds.map((sid: string) => ({ careerEventId: eventId, skillNodeId: sid })),
        });
      }
    }

    return tx.careerEvent.findUnique({
      where: { id: eventId },
      include: { skills: { include: { skillNode: { select: { id: true, name: true, type: true } } } } },
    });
  });

  return NextResponse.json(updated);
}

/** DELETE — remove a career event */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, eventId } = await params;

  const existing = await prisma.careerEvent.findFirst({
    where: { id: eventId, workHistoryId: id, userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.careerEvent.delete({ where: { id: eventId } });

  return NextResponse.json({ deleted: true });
}
