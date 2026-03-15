import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data = await req.json();
  const milestone = await prisma.milestone.create({ data });
  return NextResponse.json(milestone, { status: 201 });
}
