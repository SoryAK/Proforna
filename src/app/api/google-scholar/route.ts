import { NextRequest, NextResponse } from "next/server";

const SERPAPI_KEY = process.env.SERPAPI_KEY;

export async function GET(req: NextRequest) {
  if (!SERPAPI_KEY) {
    return NextResponse.json(
      { error: "SERPAPI_KEY is not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q");
  const start = searchParams.get("start") || "0";
  const yearLow = searchParams.get("year_low") || "";
  const yearHigh = searchParams.get("year_high") || "";

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 }
    );
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_scholar");
  url.searchParams.set("q", query);
  url.searchParams.set("start", start);
  url.searchParams.set("hl", "en");
  if (yearLow) url.searchParams.set("as_ylo", yearLow);
  if (yearHigh) url.searchParams.set("as_yhi", yearHigh);
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

  const results = (data.organic_results ?? []).map(
    (item: Record<string, unknown>) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: item.snippet ?? "",
      publicationInfo: typeof item.publication_info === "object" && item.publication_info !== null
        ? (item.publication_info as Record<string, unknown>).summary ?? ""
        : "",
      citedBy:
        typeof item.inline_links === "object" && item.inline_links !== null
          ? ((item.inline_links as Record<string, unknown>).cited_by as Record<string, unknown>)?.total ?? null
          : null,
      citedByLink:
        typeof item.inline_links === "object" && item.inline_links !== null
          ? ((item.inline_links as Record<string, unknown>).cited_by as Record<string, unknown>)?.link ?? null
          : null,
      relatedLink:
        typeof item.inline_links === "object" && item.inline_links !== null
          ? ((item.inline_links as Record<string, unknown>).related_pages_link as string) ?? null
          : null,
      resources: (
        (item.resources as Array<Record<string, unknown>>) ?? []
      ).map((r) => ({
        title: r.title ?? "",
        fileFormat: r.file_format ?? "",
        link: r.link ?? "",
      })),
      position: item.position ?? 0,
    })
  );

  return NextResponse.json({
    results,
    searchInfo: data.search_information ?? {},
    hasMore: results.length >= 10,
  });
}
