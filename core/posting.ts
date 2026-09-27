export type Posting = {
  id: string;
  title: string;
  organization: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  url: string;
  summary: string;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  contract: string;
  postedOn: string;
  category: string;
};

const GENERIC_TITLES = new Set([
  "career",
  "careers",
  "home",
  "job",
  "jobs",
  "job openings",
  "join our team",
  "join us",
  "openings",
  "welcome",
  "work with us",
]);

export function postingFromPage(input: {
  organization?: unknown;
  url?: unknown;
  html?: unknown;
  query?: unknown;
  place?: unknown;
}): Posting | null {
  const organization = text(input.organization);
  const url = text(input.url);
  if (!organization || !url) return null;
  const html = text(input.html).slice(0, 500_000);
  const visible = visibleText(html);
  const title = chooseTitle(html, visible, text(input.query), organization);
  if (!title) return null;
  const description = visible.slice(0, 8000);
  return {
    id: `page:${url}`,
    title,
    organization,
    location: chooseLocation(visible, text(input.place)),
    latitude: null,
    longitude: null,
    url,
    summary: description.replace(/\s+/g, " ").slice(0, 180),
    description,
    salaryMin: null,
    salaryMax: null,
    contract: "",
    postedOn: "",
    category: "",
  };
}

function chooseTitle(
  html: string,
  visible: string,
  query: string,
  organization: string,
): string | null {
  const headings = [...headingTexts(html), documentTitle(html)]
    .map((value) => cleanTitle(value, organization))
    .filter(Boolean);
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  if (words.length > 0) {
    const named = headings.find((heading) =>
      words.some((word) => heading.toLowerCase().includes(word)),
    );
    if (named) return named;
    const page = visible.toLowerCase();
    if (words.every((word) => page.includes(word))) return roleName(query);
    return null;
  }
  return headings.find((heading) => !isGeneric(heading)) ?? null;
}

function chooseLocation(visible: string, place: string): string {
  const labeled = visible.match(/Location\s*[:|]\s*([^\n]{2,80})/i)?.[1]?.trim() ?? "";
  if (labeled) return labeled;
  if (place && visible.toLowerCase().includes(place.toLowerCase())) return place;
  return "";
}

function headingTexts(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const heading = visibleText(match[1] ?? "");
    if (heading) found.push(heading);
  }
  return found;
}

function documentTitle(html: string): string {
  return visibleText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

function cleanTitle(value: string, organization: string): string {
  const parts = value
    .split(/\s+[|–—-]\s+/)
    .map((part) => part.trim())
    .filter((part) => part.toLowerCase() !== organization.toLowerCase());
  return parts.join(" – ").replace(/\s+/g, " ").trim();
}

function isGeneric(value: string): boolean {
  return GENERIC_TITLES.has(value.toLowerCase());
}

function roleName(query: string): string {
  const words = query.trim().replace(/\s+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
