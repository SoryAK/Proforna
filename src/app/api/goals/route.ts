import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const goals = await prisma.careerGoal.findMany({ where: { userId },
    include: { milestones: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { milestones, ...data } = await req.json();
  const goal = await prisma.careerGoal.create({
    data: { userId,
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
