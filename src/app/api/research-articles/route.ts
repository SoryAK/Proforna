import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const feedId = sp.get("feedId");
  const bookmarked = sp.get("bookmarked");
  const unread = sp.get("unread");
  const search = sp.get("q");

  const where: Record<string, unknown> = {};
  if (feedId) where.feedId = feedId;
  if (bookmarked === "true") where.isBookmarked = true;
  if (unread === "true") where.isRead = false;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { summary: { contains: search } },
    ];
  }

  const articles = await prisma.researchArticle.findMany({
    where,
    include: { feed: { select: { title: true, category: true } } },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(articles);
}
