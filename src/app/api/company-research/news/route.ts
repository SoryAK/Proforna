import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get("company");
  if (!company) return NextResponse.json([], { status: 400 });

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(company)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, { next: { revalidate: 1800 } });
    if (!res.ok) return NextResponse.json([]);

    const xml = await res.text();

    // Parse RSS items
    const items: { title: string; link: string; source: string; pubDate: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const itemXml = match[1];
      const title = tagContent(itemXml, "title");
      const link = tagContent(itemXml, "link");
      const pubDate = tagContent(itemXml, "pubDate");
      const source = tagContent(itemXml, "source") || "";
      if (title && link) {
        items.push({ title, link, source, pubDate: pubDate || "" });
      }
    }

    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}

function tagContent(xml: string, tag: string): string | null {
  // Handle CDATA
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = cdataRe.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}
