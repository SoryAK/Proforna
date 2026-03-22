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
  const location = searchParams.get("location") || "United States";
  const nextPageToken = searchParams.get("next_page_token") || "";

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 }
    );
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_jobs");
  url.searchParams.set("q", query);
  url.searchParams.set("location", location);
  if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
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

  const jobs = (data.jobs_results ?? []).map(
    (job: Record<string, unknown>) => ({
      title: job.title ?? "",
      company: job.company_name ?? "",
      location: job.location ?? "",
      description: job.description ?? "",
      thumbnail: job.thumbnail ?? null,
      via: job.via ?? "",
      extensions: job.extensions ?? [],
      jobId: job.job_id ?? "",
      applyLinks: (
        (job.apply_options as Array<Record<string, unknown>>) ?? []
      ).map((opt) => ({
        title: opt.title ?? "",
        link: opt.link ?? "",
      })),
      detectedExtensions: job.detected_extensions ?? {},
    })
  );

  return NextResponse.json({
    jobs,
    searchInfo: data.search_information ?? {},
    hasMore: !!data.serpapi_pagination?.next_page_token,
    nextPageToken: data.serpapi_pagination?.next_page_token ?? null,
  });
}
