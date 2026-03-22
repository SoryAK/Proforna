import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function PATCH(
  req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const interview = await prisma.interview.update({ where: { id  }, data });
  await logActivity("interview", id, "updated", `Updated interview ${interview.type}`);
  return NextResponse.json(interview);
}

export async function DELETE(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.interview.delete({ where: { id  } });
  await logActivity("interview", id, "deleted", "Deleted interview");
  return NextResponse.json({ success: true });
}
