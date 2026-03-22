import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
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
  const resume = await prisma.interactiveResume.findFirst({
    where: { id , userId },
    include: { _count: { select: { views: true } } },
  });
  if (!resume) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(resume);
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
  const resume = await prisma.interactiveResume.update({ where: { id  }, data });
  await logActivity("interactive-resume", id, "updated", `Updated interactive resume: ${resume.title}`);
  return NextResponse.json(resume);
}

export async function DELETE(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.interactiveResume.delete({ where: { id  } });
  await logActivity("interactive-resume", id, "deleted", "Deleted interactive resume");
  return NextResponse.json({ success: true });
}
