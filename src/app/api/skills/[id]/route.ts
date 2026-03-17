import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await req.json();
  const skill = await prisma.skill.update({ where: { id }, data });
  await logActivity("skill", id, "updated", `Updated skill: ${skill.name}`);
  return NextResponse.json(skill);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.skill.delete({ where: { id } });
  await logActivity("skill", id, "deleted", "Deleted skill");
  return NextResponse.json({ success: true });
}
