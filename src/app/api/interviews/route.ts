import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const interviews = await prisma.interview.findMany({ where: { userId },
    include: { jobApplication: { select: { company: true, role: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  return NextResponse.json(interviews);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const interview = await prisma.interview.create({
    data,
    include: { jobApplication: { select: { company: true, role: true } } },
  });
  await logActivity("interview", interview.id, "created", `Scheduled ${interview.type} interview at ${interview.jobApplication.company}`);
  return NextResponse.json(interview, { status: 201 });
}
