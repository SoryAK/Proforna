import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await req.json();
  const goal = await prisma.careerGoal.update({
    where: { id },
    data,
    include: { milestones: true },
  });
  await logActivity("goal", id, "updated", `Updated goal: ${goal.title}`);
  return NextResponse.json(goal);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.careerGoal.delete({ where: { id } });
  await logActivity("goal", id, "deleted", "Deleted goal");
  return NextResponse.json({ success: true });
}
