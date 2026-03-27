import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached, TTL } from "@/lib/cache";

/**
 * Resolve a company name + location to a precise street address via
 * Google Places Text Search API, OR geocode a raw address string.
 *
 * GET ?company=Google&location=Chicago,%20IL
 *   → { address: "320 N Morgan St...", lat: 41.88, lng: -87.65, name: "Google Chicago", confidence: "high", totalResults: 1 }
 *
 * GET ?address=123+Main+St,+Chicago,+IL&mode=geocode
 *   → { address: "123 Main St, Chicago, IL 60601", lat: 41.88, lng: -87.63, name: null, confidence: "high", totalResults: 1 }
 */

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface ResolveResult {
  address: string | null;
  lat: number | null;
  lng: number | null;
  name: string | null;
  confidence: "high" | "medium" | "low";
  totalResults: number;
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GOOGLE_KEY)
    return NextResponse.json(
      { error: "Google Maps API key not configured" },
      { status: 503 }
    );

  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("mode") ?? "places";

  // ── Geocode mode: raw address string → coords ──
  if (mode === "geocode") {
    const address = searchParams.get("address")?.trim();
    if (!address)
      return NextResponse.json({ error: "address parameter required" }, { status: 400 });

    const cacheKey = `geocode:${address.toLowerCase()}`;
    try {
      const result = await cached<ResolveResult | null>(cacheKey, TTL.GEOCODE, async () => {
        const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        url.searchParams.set("address", address);
        url.searchParams.set("key", GOOGLE_KEY);

        const res = await fetch(url.toString());
        if (!res.ok) return null;

        const data = await res.json();
        if (data.status !== "OK" || !data.results?.length) return null;

        const place = data.results[0];
        return {
          address: place.formatted_address ?? null,
          lat: place.geometry?.location?.lat ?? null,
          lng: place.geometry?.location?.lng ?? null,
          name: null,
          confidence: data.results.length === 1 ? "high" : "medium",
          totalResults: data.results.length,
        };
      });

      if (!result?.lat || !result?.lng)
        return NextResponse.json({ error: "No results found" }, { status: 404 });
      return NextResponse.json(result);
    } catch {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
    }
  }

  // ── Places mode: company + location → establishment search ──
  const company = searchParams.get("company")?.trim();
  const location = searchParams.get("location")?.trim();

  if (!company)
    return NextResponse.json(
      { error: "company parameter required" },
      { status: 400 }
    );

  const query = location ? `${company}, ${location}` : company;
  const cacheKey = `resolve:${query.toLowerCase()}`;

  try {
    const result = await cached<ResolveResult | null>(cacheKey, TTL.GEOCODE, async () => {
      const url = new URL(
        "https://maps.googleapis.com/maps/api/place/textsearch/json"
      );
      url.searchParams.set("query", query);
      url.searchParams.set("key", GOOGLE_KEY);
      url.searchParams.set("type", "establishment");

      const res = await fetch(url.toString());
      if (!res.ok) return null;

      const data = await res.json();
      if (data.status !== "OK" || !data.results?.length) return null;

      const totalResults = data.results.length;
      const place = data.results[0];

      // Confidence: high if exact match or single result, low if many ambiguous results
      let confidence: "high" | "medium" | "low" = "medium";
      const nameMatch = place.name?.toLowerCase().includes(company.toLowerCase());
      if (totalResults === 1 || nameMatch) confidence = "high";
      else if (totalResults > 5) confidence = "low";

      return {
        address: place.formatted_address ?? null,
        lat: place.geometry?.location?.lat ?? null,
        lng: place.geometry?.location?.lng ?? null,
        name: place.name ?? null,
        confidence,
        totalResults,
      };
    });

    if (!result || !result.lat || !result.lng)
      return NextResponse.json(
        { error: "No results found" },
        { status: 404 }
      );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to resolve address" },
      { status: 500 }
    );
  }
}
