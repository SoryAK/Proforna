/**
 * Minimal RSS / Atom feed parser using only built-in XML handling.
 * Works server-side in Next.js API routes.
 */

export interface FeedItem {
  title: string;
  url: string;
  summary: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
  source: string | null;
}

export interface ParsedFeed {
  title: string;
  items: FeedItem[];
}

/**
 * Fetches and parses an RSS/Atom feed URL.
 * Returns structured feed data.
 */
export async function fetchAndParseFeed(feedUrl: string): Promise<ParsedFeed> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ResumesifyBot/1.0)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });

    if (!res.ok) throw new Error(`Feed returned ${res.status}`);

    const xml = await res.text();
    return parseFeedXml(xml, feedUrl);
  } finally {
    clearTimeout(timeout);
  }
}

/** Extract text content between XML tags (simple regex-based) */
function tag(xml: string, name: string): string | null {
  // Handle CDATA: <tag><![CDATA[content]]></tag>
  const cdataRe = new RegExp(`<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${name}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return stripHtml(cdataMatch[1].trim());

  // Handle regular: <tag>content</tag>
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const match = xml.match(re);
  return match ? stripHtml(match[1].trim()) : null;
}

/** Get attribute value from a self-closing or open tag */
function attr(xml: string, tagName: string, attrName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*?${attrName}=["']([^"']*)["']`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

/** Strip HTML tags from text */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exported for use in components to clean existing DB records */
export { stripHtml };

/** Try to extract an image URL from content or media tags */
function extractImage(itemXml: string): string | null {
  // media:content or media:thumbnail
  const media = attr(itemXml, "media:content", "url") || attr(itemXml, "media:thumbnail", "url");
  if (media) return media;

  // enclosure with image type
  const encType = attr(itemXml, "enclosure", "type");
  if (encType && encType.startsWith("image")) {
    return attr(itemXml, "enclosure", "url");
  }

  // First img src in description/content
  const imgMatch = itemXml.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch ? imgMatch[1] : null;
}

function parseFeedXml(xml: string, feedUrl: string): ParsedFeed {
  const isAtom = xml.includes("<feed") && xml.includes("xmlns=\"http://www.w3.org/2005/Atom\"");

  if (isAtom) return parseAtom(xml, feedUrl);
  return parseRss(xml, feedUrl);
}

function parseRss(xml: string, feedUrl: string): ParsedFeed {
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i);
  const channel = channelMatch ? channelMatch[1] : xml;

  const feedTitle = tag(channel.split("<item")[0], "title") || new URL(feedUrl).hostname;

  const items: FeedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = tag(itemXml, "title");
    const link = tag(itemXml, "link");

    if (!title || !link) continue;

    const pubDate = tag(itemXml, "pubDate");
    const dcDate = tag(itemXml, "dc:date");
    const dateStr = pubDate || dcDate;

    items.push({
      title,
      url: link,
      summary: tag(itemXml, "description") || null,
      publishedAt: dateStr ? new Date(dateStr) : null,
      imageUrl: extractImage(itemXml),
      source: tag(itemXml, "dc:creator") || feedTitle,
    });
  }

  return { title: feedTitle, items };
}

function parseAtom(xml: string, feedUrl: string): ParsedFeed {
  const feedTitle = tag(xml.split("<entry")[0], "title") || new URL(feedUrl).hostname;

  const items: FeedItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const title = tag(entryXml, "title");

    // Atom links use href attribute
    const link = attr(entryXml, 'link[rel="alternate"]', "href")
      || attr(entryXml, "link", "href");

    if (!title || !link) continue;

    const updated = tag(entryXml, "updated");
    const published = tag(entryXml, "published");
    const dateStr = published || updated;

    items.push({
      title,
      url: link,
      summary: tag(entryXml, "summary") || tag(entryXml, "content") || null,
      publishedAt: dateStr ? new Date(dateStr) : null,
      imageUrl: extractImage(entryXml),
      source: tag(entryXml, "author") ? tag(entryXml, "name") : feedTitle,
    });
  }

  return { title: feedTitle, items };
}
