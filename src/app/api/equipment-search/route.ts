import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/equipment-search?q=conveyor
 *
 * Searches Wikipedia for equipment / tool types and returns
 * titles, short descriptions, and optional thumbnail URLs.
 * Useful for helping users identify the exact type of equipment
 * they're working with (e.g. belt conveyor vs roller conveyor).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Limit query length to prevent abuse
  const query = q.slice(0, 120);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const url = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "Resumsify/1.0 (equipment-lookup)" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }

    const data = await res.json();

    const results = (data.pages ?? []).map(
      (p: {
        title: string;
        description?: string;
        excerpt?: string;
        thumbnail?: { url: string };
      }) => ({
        title: p.title,
        description: p.description ?? null,
        excerpt: p.excerpt
          ? p.excerpt.replace(/<[^>]+>/g, "").slice(0, 200)
          : null,
        thumbnail: p.thumbnail?.url
          ? `https:${p.thumbnail.url}`
          : null,
      })
    );

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
