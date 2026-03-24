import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const STALE_DAYS = 7;
const MAX_RESULTS = 6;

interface YouTubeItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      medium?: { url: string; width: number; height: number };
      high?: { url: string; width: number; height: number };
    };
  };
}

export interface VideoItem {
  videoId: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string;
  thumbnail: string;
  source: "youtube" | "dailymotion";
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

async function fetchFromYouTube(query: string): Promise<VideoItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(MAX_RESULTS),
    order: "relevance",
    videoEmbeddable: "true",
    safeSearch: "strict",
    key: apiKey,
  });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    { next: { revalidate: 0 } }
  );

  if (!res.ok) return [];

  const data = await res.json();
  const items: YouTubeItem[] = data.items ?? [];

  return items.map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    channel: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnail:
      item.snippet.thumbnails.high?.url ??
      item.snippet.thumbnails.medium?.url ??
      "",
    source: "youtube" as const,
  }));
}

interface DailymotionItem {
  id: string;
  title: string;
  description: string;
  "owner.screenname": string;
  created_time: number;
  thumbnail_480_url: string;
}

async function fetchFromDailymotion(query: string): Promise<VideoItem[]> {
  const params = new URLSearchParams({
    search: query,
    fields: "id,title,description,owner.screenname,created_time,thumbnail_480_url",
    limit: String(MAX_RESULTS),
    sort: "relevance",
    longer_than: "1",          // skip ultra-short clips
    no_live: "1",
    no_premium: "1",
  });

  try {
    const res = await fetch(
      `https://api.dailymotion.com/videos?${params.toString()}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const items: DailymotionItem[] = data.list ?? [];

    return items.map((item) => ({
      videoId: item.id,
      title: item.title,
      description: item.description ?? "",
      channel: item["owner.screenname"] ?? "Dailymotion",
      publishedAt: new Date(item.created_time * 1000).toISOString(),
      thumbnail: item.thumbnail_480_url ?? "",
      source: "dailymotion" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * GET /api/videos?q=<query>&category=<category>
 *
 * If no query is provided, builds queries from the user's profile.
 * Returns cached results when fresh, otherwise fetches from YouTube.
 */
export async function GET(req: NextRequest) {
  try {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const explicitQuery = searchParams.get("q");
  const category = searchParams.get("category") ?? "general";

  // If explicit query provided, handle single query
  if (explicitQuery) {
    const result = await getVideosForQuery(explicitQuery, category);
    return NextResponse.json(result);
  }

  // Build queries from user profile
  const [profile, position, skills] = await Promise.all([
    prisma.userProfile.findFirst({ where: { userId } }),
    prisma.currentPosition.findFirst({
      where: { userId, isActive: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.skill.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const queries: { query: string; category: string }[] = [];

  // Industry / role query
  const role = position?.role ?? profile?.preferredRoles?.split(",")[0]?.trim();
  const company = position?.company;
  if (role) {
    queries.push({
      query: `${role} career tips ${new Date().getFullYear()}`,
      category: "career",
    });
  }

  // Tools / tech stack
  const techStack = position?.techStack;
  if (techStack) {
    const tools = techStack.split(",").slice(0, 3).map((t) => t.trim()).join(" ");
    queries.push({
      query: `${tools} tutorial ${new Date().getFullYear()}`,
      category: "tools",
    });
  }

  // Skills
  if (skills.length > 0) {
    const topSkillNames = skills.slice(0, 3).map((s) => s.name).join(" ");
    queries.push({
      query: `${topSkillNames} skills development`,
      category: "skills",
    });
  }

  // Industry from company or role
  if (company && role) {
    queries.push({
      query: `${role} industry trends ${new Date().getFullYear()}`,
      category: "industry",
    });
  }

  // Fallback
  if (queries.length === 0) {
    queries.push({
      query: "career development professional growth tips",
      category: "career",
    });
  }

  // Fetch all categories in parallel
  const results = await Promise.all(
    queries.map(async (q) => {
      const data = await getVideosForQuery(q.query, q.category);
      return { ...data, category: q.category, query: q.query };
    })
  );

  // Flatten and deduplicate by source+videoId
  const seen = new Set<string>();
  const allVideos: (VideoItem & { category: string })[] = [];
  for (const r of results) {
    for (const v of r.videos) {
      const key = `${v.source}:${v.videoId}`;
      if (!seen.has(key)) {
        seen.add(key);
        allVideos.push({ ...v, category: r.category });
      }
    }
  }

  return NextResponse.json({
    videos: allVideos,
    categories: results.map((r) => ({
      category: r.category,
      query: r.query,
      count: r.videos.length,
      cached: r.cached,
    })),
  });
  } catch (err) {
    console.error("[videos] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch videos", videos: [], categories: [] },
      { status: 200 }
    );
  }
}

async function getVideosForQuery(
  query: string,
  category: string
): Promise<{ videos: VideoItem[]; cached: boolean }> {
  const key = normalizeQuery(query);
  const now = new Date();

  // Check cache
  const cached = await prisma.siteVideoFeed.findUnique({
    where: { searchQuery: key },
  });

  if (cached && cached.staleAfter > now) {
    const videos: VideoItem[] = JSON.parse(cached.videosJson);
    return { videos, cached: true };
  }

  // Fetch from YouTube + Dailymotion in parallel
  const [ytVideos, dmVideos] = await Promise.all([
    fetchFromYouTube(query),
    fetchFromDailymotion(query),
  ]);
  const videos = [...ytVideos, ...dmVideos];

  if (videos.length > 0) {
    const staleAfter = new Date(now.getTime() + STALE_DAYS * 24 * 60 * 60 * 1000);
    await prisma.siteVideoFeed.upsert({
      where: { searchQuery: key },
      update: {
        videosJson: JSON.stringify(videos),
        category,
        fetchedAt: now,
        staleAfter,
      },
      create: {
        searchQuery: key,
        category,
        videosJson: JSON.stringify(videos),
        fetchedAt: now,
        staleAfter,
      },
    });
  }

  return { videos, cached: false };
}
