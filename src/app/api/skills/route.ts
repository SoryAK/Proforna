import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const skills = await prisma.skill.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return NextResponse.json(skills);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const skill = await prisma.skill.create({ data: { ...data, userId } });
  await logActivity("skill", skill.id, "created", `Added skill: ${skill.name}`);
  return NextResponse.json(skill, { status: 201 });
}
