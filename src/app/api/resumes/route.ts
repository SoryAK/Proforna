import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resumes = await prisma.resumeVersion.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(resumes);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const resume = await prisma.resumeVersion.create({ data: { ...data, userId } });
  await logActivity("resume", resume.id, "created", `Created resume: ${resume.name}`);
  return NextResponse.json(resume, { status: 201 });
}
