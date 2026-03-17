import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const skills = await prisma.skill.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(skills);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const skill = await prisma.skill.create({ data });
  await logActivity("skill", skill.id, "created", `Added skill: ${skill.name}`);
  return NextResponse.json(skill, { status: 201 });
}
