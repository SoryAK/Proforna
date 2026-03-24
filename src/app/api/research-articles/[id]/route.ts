import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/** Verify the article belongs to a feed owned by the current user */
async function verifyOwnership(articleId: string, userId: string) {
  const article = await prisma.researchArticle.findUnique({
    where: { id: articleId },
    include: { feed: { select: { userId: true } } },
  });
  if (!article || article.feed.userId !== userId) return null;
  return article;
}

export async function PATCH(req: NextRequest, {
 params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await verifyOwnership(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await req.json();
  const update: Record<string, unknown> = {};
  if (data.isBookmarked !== undefined) update.isBookmarked = data.isBookmarked;
  if (data.isRead !== undefined) update.isRead = data.isRead;

  const article = await prisma.researchArticle.update({ where: { id }, data: update });
  return NextResponse.json(article);
}

export async function DELETE(_req: NextRequest, {
 params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await verifyOwnership(id, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.researchArticle.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
