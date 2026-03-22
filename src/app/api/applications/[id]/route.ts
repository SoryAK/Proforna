import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const application = await prisma.jobApplication.findFirst({
    where: { id , userId },
    include: { interviews: { orderBy: { scheduledAt: "asc" } } },
  });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(application);
}

export async function PATCH(
  req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const old = await prisma.jobApplication.findFirst({ where: { id , userId } });
  const application = await prisma.jobApplication.update({ where: { id  }, data });
  if (old && old.status !== application.status) {
    await prisma.activityLog.create({
      data: { userId,
        entityType: "application",
        entityId: id,
        action: "status_changed",
        description: `${application.company} - ${application.role}: ${old.status} → ${application.status}`,
      },
    });
  }
  return NextResponse.json(application);
}

export async function DELETE(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const app = await prisma.jobApplication.findFirst({ where: { id , userId } });
  await prisma.jobApplication.delete({ where: { id  } });
  if (app) {
    await prisma.activityLog.create({
      data: { userId,
        entityType: "application",
        entityId: id,
        action: "deleted",
        description: `Deleted application: ${app.role} at ${app.company}`,
      },
    });
  }
  return NextResponse.json({ success: true });
}
