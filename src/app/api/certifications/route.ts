import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const certifications = await prisma.certification.findMany({ where: { userId }, orderBy: { issueDate: "desc" } });
  return NextResponse.json(certifications);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const certification = await prisma.certification.create({ data: { ...data, userId } });
  await logActivity("certification", certification.id, "created", `Added certification: ${certification.name}`);
  return NextResponse.json(certification, { status: 201 });
}
