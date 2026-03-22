import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

// GET — lightweight search data for command palette
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [applications, contacts, goals, skills] = await Promise.all([
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
  ]);

  return NextResponse.json({ applications, contacts, goals, skills });
}
