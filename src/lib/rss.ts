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

/** Block SSRF: reject private/internal/loopback URLs */
function assertPublicUrl(urlStr: string): void {
  const u = new URL(urlStr);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('Only http/https feeds are supported');
  }
  const host = u.hostname.toLowerCase();
  // Block loopback, link-local, and common private ranges
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    throw new Error('Feeds from private/internal addresses are not allowed');
  }
}

/**
 * Fetches and parses an RSS/Atom feed URL.
 * Returns structured feed data.
 */
export async function fetchAndParseFeed(feedUrl: string): Promise<ParsedFeed> {
  assertPublicUrl(feedUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      redirect: 'follow',
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

/** Strip HTML tags from text and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Exported for use in components to clean existing DB records */
export { stripHtml };

/** Decode HTML entities so we can find <img> inside entity-encoded descriptions */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Extract raw (non-stripped) content from a tag, handling CDATA */
function rawTag(xml: string, name: string): string | null {
  const cdataRe = new RegExp(`<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${name}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1];

  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const match = xml.match(re);
  return match ? match[1] : null;
}

/** Find first <img src="..."> in an HTML string */
function findImgSrc(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/** Try to extract an image URL from content or media tags */
function extractImage(itemXml: string): string | null {
  // 1. media:content or media:thumbnail (most reliable)
  const media = attr(itemXml, "media:content", "url") || attr(itemXml, "media:thumbnail", "url");
  if (media) return media;

  // 2. enclosure with image type
  const encType = attr(itemXml, "enclosure", "type");
  if (encType && encType.startsWith("image")) {
    return attr(itemXml, "enclosure", "url");
  }

  // 3. enclosure with image-like URL (some feeds omit the type attribute)
  const encUrl = attr(itemXml, "enclosure", "url");
  if (encUrl && /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(encUrl)) {
    return encUrl;
  }

  // 4. <img> directly in the item XML (inside CDATA)
  const directImg = findImgSrc(itemXml);
  if (directImg) return directImg;

  // 5. content:encoded — WordPress & many CMS feeds put full HTML here
  const encoded = rawTag(itemXml, "content:encoded");
  if (encoded) {
    const img = findImgSrc(encoded) || findImgSrc(decodeEntities(encoded));
    if (img) return img;
  }

  // 6. description — may contain entity-encoded HTML
  const desc = rawTag(itemXml, "description");
  if (desc) {
    const img = findImgSrc(desc) || findImgSrc(decodeEntities(desc));
    if (img) return img;
  }

  // 7. Atom <content> — may contain entity-encoded HTML
  const content = rawTag(itemXml, "content");
  if (content) {
    const img = findImgSrc(content) || findImgSrc(decodeEntities(content));
    if (img) return img;
  }

  // 8. <image><url> sub-element in some RSS items
  const imageUrl = rawTag(itemXml, "image") ? rawTag(rawTag(itemXml, "image")!, "url") : null;
  if (imageUrl) return imageUrl.trim();

  return null;
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

/** Extract href from Atom <link> — tries rel="alternate" first, then first <link> */
function atomLink(entryXml: string): string | null {
  // Match <link rel="alternate" ... href="..." />
  const altRe = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const altMatch = entryXml.match(altRe);
  if (altMatch) return altMatch[1];

  // Also try href before rel (attribute order varies)
  const altRe2 = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/i;
  const altMatch2 = entryXml.match(altRe2);
  if (altMatch2) return altMatch2[1];

  // Fallback: first <link> with href
  const anyRe = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const anyMatch = entryXml.match(anyRe);
  return anyMatch ? anyMatch[1] : null;
}

function parseAtom(xml: string, feedUrl: string): ParsedFeed {
  const feedTitle = tag(xml.split("<entry")[0], "title") || new URL(feedUrl).hostname;

  const items: FeedItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const title = tag(entryXml, "title");
    const link = atomLink(entryXml);

    if (!title || !link) continue;

    const updated = tag(entryXml, "updated");
    const published = tag(entryXml, "published");
    const dateStr = published || updated;

    // Extract author name from <author><name>...</name></author>
    const authorBlock = entryXml.match(/<author>([\s\S]*?)<\/author>/i);
    const authorName = authorBlock ? tag(authorBlock[1], "name") : null;

    items.push({
      title,
      url: link,
      summary: tag(entryXml, "summary") || tag(entryXml, "content") || null,
      publishedAt: dateStr ? new Date(dateStr) : null,
      imageUrl: extractImage(entryXml),
      source: authorName || feedTitle,
    });
  }

  return { title: feedTitle, items };
}
