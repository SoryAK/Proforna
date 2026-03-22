import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { fetchAndParseFeed } from "@/lib/rss";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const feeds = await prisma.researchFeed.findMany({ where: { userId },
    include: { _count: { select: { articles: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(feeds);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url, category } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate and normalize URL
  let feedUrl = url.trim();
  if (!/^https?:\/\//i.test(feedUrl)) feedUrl = `https://${feedUrl}`;

  try {
    new URL(feedUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Check duplicate
  const existing = await prisma.researchFeed.findFirst({ where: { userId, url: feedUrl } });
  if (existing) {
    return NextResponse.json({ error: "Feed already exists" }, { status: 409 });
  }

  // Try to fetch to validate it's a real feed and get title
  let feedTitle = new URL(feedUrl).hostname;
  try {
    const parsed = await fetchAndParseFeed(feedUrl);
    feedTitle = parsed.title || feedTitle;
  } catch {
    // Accept anyway — might be temporarily down
  }

  const feed = await prisma.researchFeed.create({
    data: { userId,
      title: feedTitle,
      url: feedUrl,
      category: category || "general",
    },
  });

  await logActivity("research_feed", feed.id, "created", `Added feed: ${feed.title}`);
  return NextResponse.json(feed, { status: 201 });
}
