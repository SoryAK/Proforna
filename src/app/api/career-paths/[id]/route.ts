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
  const path = await prisma.careerPath.findFirst({
    where: { id , userId },
    include: {
      milestones: { orderBy: { sortOrder: "asc" } },
      scores: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { snapshot: { select: { capturedAt: true } } },
      },
    },
  });
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(path);
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

  if (Array.isArray(data.requiredSkills)) {
    data.requiredSkills = JSON.stringify(data.requiredSkills);
  }

  // Handle milestones separately
  const { milestones, ...pathData } = data;

  const path = await prisma.careerPath.update({
    where: { id  },
    data: pathData,
  });

  // If milestones provided, replace all
  if (Array.isArray(milestones)) {
    await prisma.careerPathMilestone.deleteMany({ where: { pathId: id } });
    if (milestones.length > 0) {
      await prisma.careerPathMilestone.createMany({
        data: milestones.map((m: { title: string; description?: string; isRequired?: boolean }, i: number) => ({
          pathId: id,
          title: m.title,
          description: m.description || null,
          isRequired: m.isRequired || false,
          sortOrder: i,
        })),
      });
    }
  }

  await logActivity("career-path", id, "updated", `Updated career path: ${path.title}`);
  return NextResponse.json(path);
}

export async function DELETE(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.careerPath.delete({ where: { id  } });
  await logActivity("career-path", id, "deleted", "Deleted career path");
  return NextResponse.json({ success: true });
}
