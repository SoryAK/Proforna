import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const interviews = await prisma.interview.findMany({
    include: { jobApplication: { select: { company: true, role: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  return NextResponse.json(interviews);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const interview = await prisma.interview.create({
    data,
    include: { jobApplication: { select: { company: true, role: true } } },
  });
  return NextResponse.json(interview, { status: 201 });
}
