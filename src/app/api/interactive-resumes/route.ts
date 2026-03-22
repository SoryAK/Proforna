import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resumes = await prisma.interactiveResume.findMany({ where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { views: true } } },
  });
  return NextResponse.json(resumes);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();

  // Generate slug from title if not provided
  if (!data.slug) {
    const base = (data.title || "resume")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = Math.random().toString(36).slice(2, 8);
    data.slug = `${base}-${suffix}`;
  }

  const resume = await prisma.interactiveResume.create({ data: { ...data, userId } });
  await logActivity("interactive-resume", resume.id, "created", `Created interactive resume: ${resume.title}`);
  return NextResponse.json(resume, { status: 201 });
}
