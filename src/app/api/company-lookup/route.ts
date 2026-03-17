import { NextResponse } from "next/server";

/**
 * POST /api/company-lookup
 * Accepts { url: string } and fetches the page's meta tags
 * to auto-fill company name and synopsis.
 */
export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Normalise URL
    let fullUrl = url.trim();
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = `https://${fullUrl}`;
    }

    // Validate it's a proper URL
    let parsed: URL;
    try {
      parsed = new URL(fullUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: "Only HTTP/HTTPS URLs are supported" },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ResumesifyBot/1.0; +https://resumsify.app)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${res.status}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "URL did not return HTML" },
        { status: 400 }
      );
    }

    // Only read first 100KB to avoid fetching huge pages
    const html = (await res.text()).slice(0, 100_000);

    return NextResponse.json(extractMeta(html));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("abort")) {
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Meta extraction (company name + synopsis only) ──────────────

function extractMeta(html: string) {
  const get = (re: RegExp): string | null => {
    const m = html.match(re);
    return m ? decode(m[1].trim()) : null;
  };

  // Try both attribute orders: property→content and content→property
  const ogSiteName =
    get(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);

  const ogTitle =
    get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);

  const ogDesc =
    get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);

  const metaDesc =
    get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

  const titleTag = get(/<title[^>]*>([^<]+)<\/title>/i);

  // Schema.org JSON-LD (name + description only)
  let schemaName = "";
  let schemaDesc = "";
  const ldMatch = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (ldMatch) {
    try {
      const j = JSON.parse(ldMatch[1]);
      const org =
        j["@type"] === "Organization"
          ? j
          : j["@graph"]?.find?.(
              (n: Record<string, string>) => n["@type"] === "Organization"
            );
      if (org) {
        schemaName = org.name || "";
        schemaDesc = org.description || "";
      }
    } catch {
      // ignore
    }
  }

  const company = ogSiteName || schemaName || ogTitle || titleTag || null;
  const synopsis = ogDesc || metaDesc || schemaDesc || null;

  return {
    company: company
      ? company.split("|")[0].split("\u2013")[0].split("-")[0].trim()
      : null,
    companySynopsis: synopsis,
  };
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
