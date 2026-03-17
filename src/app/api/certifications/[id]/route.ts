import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await req.json();
  const certification = await prisma.certification.update({ where: { id }, data });
  await logActivity("certification", id, "updated", `Updated certification: ${certification.name}`);
  return NextResponse.json(certification);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.certification.delete({ where: { id } });
  await logActivity("certification", id, "deleted", "Deleted certification");
  return NextResponse.json({ success: true });
}
