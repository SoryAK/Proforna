import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const update: Record<string, unknown> = {};
  if (data.isBookmarked !== undefined) update.isBookmarked = data.isBookmarked;
  if (data.isRead !== undefined) update.isRead = data.isRead;

  const article = await prisma.researchArticle.update({ where: { id }, data: update });
  return NextResponse.json(article);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.researchArticle.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
