import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/**
 * Batch geocode location strings → lat/lng via Nominatim (free, no key).
 * POST { locations: ["Philadelphia, PA", "Trenton, NJ"] }
 * → { results: { "Philadelphia, PA": { lat: 39.95, lng: -75.16 }, ... } }
 *
 * Deduplicates internally and respects Nominatim's 1 req/sec policy.
 */

interface GeoResult {
  lat: number;
  lng: number;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const locations: string[] = body.locations ?? [];

  if (!Array.isArray(locations) || locations.length === 0)
    return NextResponse.json(
      { error: "Provide a locations array" },
      { status: 400 }
    );

  // Cap at 50 unique locations to avoid abuse
  const unique = [...new Set(locations.map((l: string) => l.trim()).filter(Boolean))].slice(0, 50);

  const results: Record<string, GeoResult> = {};

  // Batch with 1-second gaps to respect Nominatim usage policy
  for (const loc of unique) {
    try {
      const encoded = encodeURIComponent(loc);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`,
        { headers: { "User-Agent": "Resumsify/1.0" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        results[loc] = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
      // Nominatim rate limit: 1 request per second
      if (unique.indexOf(loc) < unique.length - 1) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    } catch {
      // Skip failed geocodes silently
    }
  }

  return NextResponse.json({ results });
}
