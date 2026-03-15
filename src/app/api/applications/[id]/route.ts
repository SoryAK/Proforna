import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const application = await prisma.jobApplication.findUnique({
    where: { id },
    include: { interviews: { orderBy: { scheduledAt: "asc" } } },
  });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(application);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await req.json();
  const old = await prisma.jobApplication.findUnique({ where: { id } });
  const application = await prisma.jobApplication.update({ where: { id }, data });
  if (old && old.status !== application.status) {
    await prisma.activityLog.create({
      data: {
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = await prisma.jobApplication.findUnique({ where: { id } });
  await prisma.jobApplication.delete({ where: { id } });
  if (app) {
    await prisma.activityLog.create({
      data: {
        entityType: "application",
        entityId: id,
        action: "deleted",
        description: `Deleted application: ${app.role} at ${app.company}`,
      },
    });
  }
  return NextResponse.json({ success: true });
}
