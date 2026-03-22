import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const SERPAPI_KEY = process.env.SERPAPI_KEY;

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!SERPAPI_KEY) {
    return NextResponse.json(
      { error: "SERPAPI_KEY is not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q");
  const topic = searchParams.get("topic") || "";

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 }
    );
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_news");
  url.searchParams.set("q", query);
  if (topic) url.searchParams.set("topic", topic);
  url.searchParams.set("gl", "us");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", SERPAPI_KEY);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: "SerpAPI request failed", details: text },
      { status: response.status }
    );
  }

  const data = await response.json();

  const articles = (data.news_results ?? []).map(
    (item: Record<string, unknown>) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      source: typeof item.source === "object" && item.source !== null
        ? (item.source as Record<string, unknown>).name ?? ""
        : item.source ?? "",
      date: item.date ?? "",
      snippet: item.snippet ?? "",
      thumbnail: item.thumbnail ?? null,
      stories: (
        (item.stories as Array<Record<string, unknown>>) ?? []
      ).map((s) => ({
        title: s.title ?? "",
        link: s.link ?? "",
        source: typeof s.source === "object" && s.source !== null
          ? (s.source as Record<string, unknown>).name ?? ""
          : s.source ?? "",
        date: s.date ?? "",
      })),
    })
  );

  return NextResponse.json({
    articles,
    searchInfo: data.search_information ?? {},
  });
}
