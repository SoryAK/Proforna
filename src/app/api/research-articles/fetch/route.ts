import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { fetchAndParseFeed } from "@/lib/rss";
import { getUserId } from "@/lib/auth-utils";

/**
 * POST /api/research-articles/fetch
 * Fetches new articles from all active feeds belonging to the current user.
 * Feeds are fetched in parallel (max 5 concurrent) for better performance.
 */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const feeds = await prisma.researchFeed.findMany({
    where: { isActive: true, userId },
  });

  let totalNew = 0;
  const errors: string[] = [];

  // Process feeds in parallel batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
    const batch = feeds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (feed) => {
        const parsed = await fetchAndParseFeed(feed.url);

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
        }

        await prisma.researchFeed.update({
          where: { id: feed.id },
          data: { lastFetchedAt: new Date() },
        });

        return newItems.length;
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        totalNew += result.value;
      } else {
        errors.push(`${batch[j].title}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`);
      }
    }
  }

  return NextResponse.json({
    fetched: totalNew,
    feedsProcessed: feeds.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
