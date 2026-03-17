import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const certifications = await prisma.certification.findMany({ orderBy: { issueDate: "desc" } });
  return NextResponse.json(certifications);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const certification = await prisma.certification.create({ data });
  await logActivity("certification", certification.id, "created", `Added certification: ${certification.name}`);
  return NextResponse.json(certification, { status: 201 });
}
