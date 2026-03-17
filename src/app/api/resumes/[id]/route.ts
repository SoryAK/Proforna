import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await req.json();
  const resume = await prisma.resumeVersion.update({ where: { id }, data });
  await logActivity("resume", id, "updated", `Updated resume: ${resume.name}`);
  return NextResponse.json(resume);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.resumeVersion.delete({ where: { id } });
  await logActivity("resume", id, "deleted", "Deleted resume");
  return NextResponse.json({ success: true });
}
