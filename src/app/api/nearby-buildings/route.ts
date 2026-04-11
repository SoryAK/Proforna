import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached } from "@/lib/cache";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
const TTL = 24 * 60 * 60 * 1000; // 24 hours

interface NearbyBuilding {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
}

/**
 * GET /api/nearby-buildings?query=Barry+Callebaut&lat=39.86&lng=-75.32&radius=1500
 *
 * Searches Google Places (Text Search) for buildings matching the company name
 * near the given coordinates. Returns up to 10 candidates.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GOOGLE_KEY)
    return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 503 });

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("query")?.trim();
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const radius = Math.min(Math.max(parseInt(searchParams.get("radius") ?? "1500", 10) || 1500, 200), 50000);

  if (!query || isNaN(lat) || isNaN(lng))
    return NextResponse.json({ error: "query, lat, lng are required" }, { status: 400 });

  // Round coords for better cache hits
  const rLat = Math.round(lat * 1000) / 1000;
  const rLng = Math.round(lng * 1000) / 1000;
  const cacheKey = `nearby-buildings:${query.toLowerCase()}:${rLat},${rLng}:${radius}`;

  const buildings = await cached<NearbyBuilding[]>(cacheKey, TTL, async () => {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    url.searchParams.set("location", `${lat},${lng}`);
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("key", GOOGLE_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();

    return ((data.results ?? []) as Array<{
      place_id: string;
      name: string;
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
      types?: string[];
    }>)
      .slice(0, 20)
      .map((p) => ({
        placeId: p.place_id,
        name: p.name,
        address: p.formatted_address,
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
        types: p.types ?? [],
      }));
  });

  return NextResponse.json({ buildings });
}

/**
 * POST /api/nearby-buildings — Fetch Place Details for a single placeId.
 * Body: { placeId: string }
 * Returns: { name, address, lat, lng, placeId }
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GOOGLE_KEY)
    return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 503 });

  const body = await req.json();
  const placeId = body.placeId?.trim();
  if (!placeId)
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,geometry,place_id&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  if (!res.ok)
    return NextResponse.json({ error: "Places API error" }, { status: 502 });

  const data = await res.json();
  if (data.status !== "OK" || !data.result)
    return NextResponse.json({ error: "Place not found" }, { status: 404 });

  const r = data.result;
  return NextResponse.json({
    placeId: r.place_id,
    name: r.name ?? "Unknown",
    address: r.formatted_address ?? "",
    lat: r.geometry?.location?.lat ?? 0,
    lng: r.geometry?.location?.lng ?? 0,
  });
}
