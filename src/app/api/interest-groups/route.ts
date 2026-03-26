import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.interestGroup.findMany({
    where: { userId },
    include: { _count: { select: { items: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, color } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const group = await prisma.interestGroup.create({
    data: { userId, name: name.trim(), ...(color ? { color } : {}) },
  });
  return NextResponse.json(group, { status: 201 });
}
