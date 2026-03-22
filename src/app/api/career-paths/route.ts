import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paths = await prisma.careerPath.findMany({ where: { userId },
    orderBy: { sortOrder: "asc" },
    include: {
      milestones: { orderBy: { sortOrder: "asc" } },
      _count: { select: { scores: true } },
    },
  });
  return NextResponse.json(paths);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();

  // Parse requiredSkills if it's an array
  if (Array.isArray(data.requiredSkills)) {
    data.requiredSkills = JSON.stringify(data.requiredSkills);
  }

  const { milestones, ...pathData } = data;

  const path = await prisma.careerPath.create({
    data: { userId,
      ...pathData,
      milestones: milestones?.length
        ? { create: milestones.map((m: { title: string; description?: string; isRequired?: boolean }, i: number) => ({
            title: m.title,
            description: m.description || null,
            isRequired: m.isRequired || false,
            sortOrder: i,
          }))}
        : undefined,
    },
    include: { milestones: { orderBy: { sortOrder: "asc" } } },
  });

  await logActivity("career-path", path.id, "created", `Created career path: ${path.title}`);
  return NextResponse.json(path, { status: 201 });
}
