import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applications = await prisma.jobApplication.findMany({ where: { userId },
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
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const application = await prisma.jobApplication.create({ data: { ...data, userId } });
  await prisma.activityLog.create({
    data: { userId,
      entityType: "application",
      entityId: application.id,
      action: "created",
      description: `Applied to ${application.role} at ${application.company}`,
    },
  });
  return NextResponse.json(application, { status: 201 });
}
