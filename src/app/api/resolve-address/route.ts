import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached, TTL } from "@/lib/cache";

/**
 * Resolve a company name + location to a precise street address via
 * Google Places Text Search API, OR geocode a raw address string.
 * Also returns enriched Place Details (website, phone, rating, hours, etc.)
 *
 * GET ?company=Google&location=Chicago,%20IL
 *   → { address, lat, lng, name, confidence, totalResults, placeId, website, phone, rating, ratingCount, businessStatus, openNow, hours, editorialSummary, types }
 *
 * GET ?address=123+Main+St,+Chicago,+IL&mode=geocode
 *   → { address, lat, lng, name: null, confidence, totalResults }
 */

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface PlaceEnrichment {
  placeId: string | null;
  website: string | null;
  phone: string | null;
  rating: number | null;
  ratingCount: number | null;
  businessStatus: string | null;
  openNow: boolean | null;
  hours: string[] | null;
  editorialSummary: string | null;
  types: string[] | null;
}

interface ResolveResult {
  address: string | null;
  lat: number | null;
  lng: number | null;
  name: string | null;
  confidence: "high" | "medium" | "low";
  totalResults: number;
  allLocations?: { address: string; lat: number; lng: number; name: string | null }[];
  // Enrichment fields (present only when resolved via Places)
  placeId?: string | null;
  website?: string | null;
  phone?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  businessStatus?: string | null;
  openNow?: boolean | null;
  hours?: string[] | null;
  editorialSummary?: string | null;
  types?: string[] | null;
}

/** Fetch Place Details for a given place_id */
async function fetchPlaceDetails(placeId: string): Promise<PlaceEnrichment> {
  const empty: PlaceEnrichment = {
    placeId, website: null, phone: null, rating: null, ratingCount: null,
    businessStatus: null, openNow: null, hours: null, editorialSummary: null, types: null,
  };

  try {
    const fields = "website,formatted_phone_number,rating,user_ratings_total,business_status,opening_hours,editorial_summary,types";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return empty;

    const data = await res.json();
    if (data.status !== "OK" || !data.result) return empty;

    const r = data.result;
    return {
      placeId,
      website: r.website ?? null,
      phone: r.formatted_phone_number ?? null,
      rating: r.rating ?? null,
      ratingCount: r.user_ratings_total ?? null,
      businessStatus: r.business_status ?? null,
      openNow: r.opening_hours?.open_now ?? null,
      hours: r.opening_hours?.weekday_text ?? null,
      editorialSummary: r.editorial_summary?.overview ?? null,
      types: r.types ?? null,
    };
  } catch {
    return empty;
  }
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
      const placeId = place.place_id ?? null;

      // Confidence: high if exact match or single result, low if many ambiguous results
      let confidence: "high" | "medium" | "low" = "medium";
      const nameMatch = place.name?.toLowerCase().includes(company.toLowerCase());
      if (totalResults === 1 || nameMatch) confidence = "high";
      else if (totalResults > 5) confidence = "low";

      // Include all locations when multiple offices found
      const allLocations = totalResults > 1
        ? data.results.slice(0, 10).map((p: any) => ({
            address: p.formatted_address ?? "",
            lat: p.geometry?.location?.lat ?? 0,
            lng: p.geometry?.location?.lng ?? 0,
            name: p.name ?? null,
          })).filter((l: any) => l.lat && l.lng)
        : undefined;

      // Fetch enriched Place Details
      const enrichment = placeId ? await fetchPlaceDetails(placeId) : {
        placeId: null, website: null, phone: null, rating: null, ratingCount: null,
        businessStatus: null, openNow: null, hours: null, editorialSummary: null, types: null,
      };

      return {
        address: place.formatted_address ?? null,
        lat: place.geometry?.location?.lat ?? null,
        lng: place.geometry?.location?.lng ?? null,
        name: place.name ?? null,
        confidence,
        totalResults,
        allLocations,
        ...enrichment,
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
