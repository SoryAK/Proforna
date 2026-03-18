import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { fetchAndParseFeed } from "@/lib/rss";

/**
 * POST /api/research-articles/fetch
 * Fetches new articles from all active feeds.
 */
export async function POST() {
  const feeds = await prisma.researchFeed.findMany({
    where: { isActive: true },
  });

  let totalNew = 0;
  const errors: string[] = [];

  for (const feed of feeds) {
    try {
      const parsed = await fetchAndParseFeed(feed.url);

      // Get existing article URLs for this feed to avoid duplicates
      const existing = await prisma.researchArticle.findMany({
        where: { feedId: feed.id },
        select: { url: true },
      });
      const existingUrls = new Set(existing.map((a) => a.url));

      const newItems = parsed.items.filter((item) => !existingUrls.has(item.url));

      if (newItems.length > 0) {
        await prisma.researchArticle.createMany({
          data: newItems.map((item) => ({
            feedId: feed.id,
            title: item.title,
            url: item.url,
            source: item.source || feed.title,
            summary: item.summary ? item.summary.slice(0, 500) : null,
            publishedAt: item.publishedAt,
            imageUrl: item.imageUrl,
          })),
        });
        totalNew += newItems.length;
      }

      await prisma.researchFeed.update({
        where: { id: feed.id },
        data: { lastFetchedAt: new Date() },
      });
    } catch (e) {
      errors.push(`${feed.title}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  return NextResponse.json({
    fetched: totalNew,
    feedsProcessed: feeds.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
