import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

// GET — lightweight search data for command palette
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [applications, contacts, goals, skills, worklogs] = await Promise.all([
    prisma.jobApplication.findMany({
      select: { id: true, company: true, role: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.careerGoal.findMany({
      where: { status: { not: "abandoned" } },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.skill.findMany({
      select: { id: true, name: true, category: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // Worklogs are PRIVATE — always scoped to the current user.
    // Never surface anyone else's entries here, even if other groups
    // are eventually broadened to public/recruiter contexts.
    prisma.workLog.findMany({
      where: { userId },
      select: { id: true, title: true, date: true, tags: true, isNotable: true, content: true },
      orderBy: { date: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({ applications, contacts, goals, skills, worklogs });
}
