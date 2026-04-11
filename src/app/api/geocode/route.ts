import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached, TTL } from "@/lib/cache";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

/**
 * GET /api/geocode?address=123+Main+St
 * Single-address forward geocode via Google Geocoding API (server-side key).
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GOOGLE_KEY)
    return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 503 });

  const address = req.nextUrl.searchParams.get("address");
  if (!address)
    return NextResponse.json({ error: "address is required" }, { status: 400 });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  const loc = data.results?.[0]?.geometry?.location;
  if (!loc)
    return NextResponse.json({ lat: null, lng: null });

  return NextResponse.json({ lat: loc.lat, lng: loc.lng });
}

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

  for (const loc of unique) {
    try {
      const geo = await cached<GeoResult | null>(`geo:${loc}`, TTL.GEOCODE, async () => {
        // Rate-limit delay BEFORE the actual request (only runs on cache miss)
        await new Promise((r) => setTimeout(r, 1100));
        const encoded = encodeURIComponent(loc);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`,
          { headers: { "User-Agent": "Resumsify/1.0" } }
        );
        const data = await res.json();
        if (data.length > 0) {
          return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          };
        }
        return null;
      });
      if (geo) results[loc] = geo;
    } catch {
      // Skip failed geocodes silently
    }
  }

  return NextResponse.json({ results });
}
