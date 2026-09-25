export type JobListing = {
  id: string;
  title: string;
  organization: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  url: string;
  summary: string;
};

export const SEARCH_RADIUS_MILES = [10, 25, 50, 100] as const;

export type SearchRadiusMiles = (typeof SEARCH_RADIUS_MILES)[number];

export type SearchRadius = {
  latitude: number;
  longitude: number;
  miles: number;
};

export type JobSearchQuery = {
  q: string;
  where: string;
  distance: string;
};

export function searchRadiusMiles(value: unknown): SearchRadiusMiles {
  const miles = Number(typeof value === "number" ? value : typeof value === "string" ? value.trim() : NaN);
  return (SEARCH_RADIUS_MILES as readonly number[]).includes(miles) ? (miles as SearchRadiusMiles) : 25;
}

export function searchRadiusFrame(
  radius: SearchRadius,
): Array<{ latitude: number; longitude: number }> {
  const latDelta = radius.miles / 69;
  const cos = Math.cos((radius.latitude * Math.PI) / 180);
  const lngDelta = radius.miles / (69 * (Math.abs(cos) < 0.2 ? 0.2 : cos));
  return [
    { latitude: radius.latitude + latDelta, longitude: radius.longitude },
    { latitude: radius.latitude - latDelta, longitude: radius.longitude },
    { latitude: radius.latitude, longitude: radius.longitude + lngDelta },
    { latitude: radius.latitude, longitude: radius.longitude - lngDelta },
  ];
}

export function prepareJobSearchQuery(input: {
  q?: unknown;
  where?: unknown;
  distance?: unknown;
}): { ok: true; value: JobSearchQuery } | { ok: false; error: "query-required" } {
  const q = text(input.q);
  const where = text(input.where);
  if (!q && !where) return { ok: false, error: "query-required" };
  const miles = Number(text(input.distance) || "25");
  const distance = Number.isFinite(miles)
    ? String(Math.min(100, Math.max(1, Math.round(miles))))
    : "25";
  return { ok: true, value: { q, where, distance } };
}

export function presentJobListings(results: unknown, query = ""): JobListing[] {
  if (!Array.isArray(results)) return [];
  const listings = results.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const title = text(row.title);
    const organization = organizationName(row);
    if (!title || !organization) return [];
    const location = locationName(row.location);
    return [
      {
        id: text(row.id) || [organization, title, location].join(":"),
        title,
        organization,
        location,
        latitude: coordinate(row.latitude, 90),
        longitude: coordinate(row.longitude, 180),
        url: text(row.redirect_url) || text(row.url),
        summary: plainText(text(row.description)).slice(0, 280),
      },
    ];
  });
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return listings;
  return listings
    .map((listing, index) => ({ listing, index }))
    .sort((left, right) => {
      const leftMatch = words.some((word) =>
        left.listing.title.toLowerCase().includes(word),
      )
        ? 0
        : 1;
      const rightMatch = words.some((word) =>
        right.listing.title.toLowerCase().includes(word),
      )
        ? 0
        : 1;
      return leftMatch - rightMatch || left.index - right.index;
    })
    .map((item) => item.listing);
}

export function mappableJobListings(
  listings: JobListing[],
): Array<JobListing & { latitude: number; longitude: number }> {
  return listings.filter(
    (listing): listing is JobListing & { latitude: number; longitude: number } =>
      listing.latitude != null &&
      listing.longitude != null &&
      Number.isFinite(listing.latitude) &&
      Number.isFinite(listing.longitude),
  );
}

function organizationName(row: Record<string, unknown>): string {
  const company = row.company;
  if (company && typeof company === "object") {
    const name = text((company as { display_name?: unknown }).display_name);
    if (name) return name;
  }
  return text(row.organization) || text(row.company);
}

function locationName(value: unknown): string {
  if (value && typeof value === "object") {
    return text((value as { display_name?: unknown }).display_name);
  }
  return text(value);
}

function coordinate(value: unknown, limit: 90 | 180): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(text(value));
  if (!Number.isFinite(number) || number < -limit || number > limit) return null;
  return number;
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
