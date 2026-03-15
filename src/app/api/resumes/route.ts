import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const resumes = await prisma.resumeVersion.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(resumes);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const resume = await prisma.resumeVersion.create({ data });
  return NextResponse.json(resume, { status: 201 });
}
