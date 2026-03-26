import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const group = await prisma.interestGroup.findFirst({
    where: { id, userId },
    include: { items: { orderBy: { createdAt: "desc" } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(group);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, color } = await req.json();
  const data: Record<string, string> = {};
  if (name?.trim()) data.name = name.trim();
  if (color) data.color = color;

  const group = await prisma.interestGroup.updateMany({
    where: { id, userId },
    data,
  });
  if (group.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.interestGroup.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
