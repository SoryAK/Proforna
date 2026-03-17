import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await req.json();
  const interview = await prisma.interview.update({ where: { id }, data });
  await logActivity("interview", id, "updated", `Updated interview ${interview.type}`);
  return NextResponse.json(interview);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.interview.delete({ where: { id } });
  await logActivity("interview", id, "deleted", "Deleted interview");
  return NextResponse.json({ success: true });
}
