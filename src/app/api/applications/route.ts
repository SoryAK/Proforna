import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const applications = await prisma.jobApplication.findMany({
    include: {
      interviews: true,
      resumeVersion: { select: { id: true, name: true, targetRole: true } },
      _count: { select: { linkedEmails: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(applications);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const application = await prisma.jobApplication.create({ data });
  await prisma.activityLog.create({
    data: {
      entityType: "application",
      entityId: application.id,
      action: "created",
      description: `Applied to ${application.role} at ${application.company}`,
    },
  });
  return NextResponse.json(application, { status: 201 });
}
