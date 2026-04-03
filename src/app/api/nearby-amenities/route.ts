import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached } from "@/lib/cache";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

const CATEGORY_TYPE_MAP: Record<string, string> = {
  restaurant: "restaurant",
  cafe: "cafe",
  gym: "gym",
  gas_station: "gas_station",
  transit_station: "transit_station",
  park: "park",
};

const AMENITY_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  rating?: number;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GOOGLE_KEY)
    return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 503 });

  const body = await req.json();
  const { lat, lng, categories, radius = 800 } = body as {
    lat: number;
    lng: number;
    categories: string[];
    radius?: number;
  };

  if (!lat || !lng || !Array.isArray(categories) || categories.length === 0)
    return NextResponse.json({ error: "Missing lat, lng, or categories" }, { status: 400 });

  // Validate categories
  const validCats = categories.filter((c) => CATEGORY_TYPE_MAP[c]);
  if (validCats.length === 0)
    return NextResponse.json({ error: "No valid categories" }, { status: 400 });

  // Cap radius at 2km for safety
  const clampedRadius = Math.min(Math.max(radius, 100), 2000);

  // Round coords to ~11m precision to improve cache hit rate
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLng = Math.round(lng * 10000) / 10000;

  const results: Record<string, PlaceResult[]> = {};

  for (const cat of validCats) {
    const cacheKey = `amenities:${roundedLat},${roundedLng}:${cat}:${clampedRadius}`;
    const placeType = CATEGORY_TYPE_MAP[cat];

    results[cat] = await cached(cacheKey, AMENITY_TTL, async () => {
      const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      url.searchParams.set("location", `${roundedLat},${roundedLng}`);
      url.searchParams.set("radius", String(clampedRadius));
      url.searchParams.set("type", placeType);
      url.searchParams.set("key", GOOGLE_KEY);

      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();

      return ((data.results ?? []) as Array<{
        name: string;
        geometry: { location: { lat: number; lng: number } };
        rating?: number;
      }>)
        .slice(0, 15) // cap to avoid pin overload
        .map((p) => ({
          name: p.name,
          lat: p.geometry.location.lat,
          lng: p.geometry.location.lng,
          rating: p.rating ?? undefined,
        }));
    });
  }

  return NextResponse.json({ results });
}
