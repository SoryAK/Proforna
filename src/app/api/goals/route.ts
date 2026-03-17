import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const goals = await prisma.careerGoal.findMany({
    include: { milestones: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  const { milestones, ...data } = await req.json();
  const goal = await prisma.careerGoal.create({
    data: {
      ...data,
      milestones: milestones?.length
        ? { create: milestones.map((m: { title: string }) => ({ title: m.title })) }
        : undefined,
    },
    include: { milestones: true },
  });
  await logActivity("goal", goal.id, "created", `Created goal: ${goal.title}`);
  return NextResponse.json(goal, { status: 201 });
}
