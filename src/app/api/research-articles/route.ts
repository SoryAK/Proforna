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
  const cursor = sp.get("cursor");
  const limit = Math.min(Number(sp.get("limit")) || 50, 100);

  // Always scope to feeds owned by this user
  const userFeedIds = (await prisma.researchFeed.findMany({
    where: { userId },
    select: { id: true },
  })).map((f) => f.id);

  const where: Record<string, unknown> = { feedId: { in: userFeedIds } };
  if (feedId && userFeedIds.includes(feedId)) where.feedId = feedId;
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
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = articles.length > limit;
  const items = hasMore ? articles.slice(0, limit) : articles;

  return NextResponse.json({
    articles: items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}
