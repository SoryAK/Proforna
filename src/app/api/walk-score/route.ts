import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

const WALKSCORE_BASE = "https://api.walkscore.com/score";

/**
 * GET /api/walk-score?lat=40.7128&lng=-74.0060&address=New+York,+NY
 *
 * Proxy to Walk Score API. Returns walk, transit, and bike scores (0-100).
 * Requires WALKSCORE_API_KEY env var. Free tier: 5,000 req/day.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.WALKSCORE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Walk Score API key not configured" }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const lat = sp.get("lat");
  const lng = sp.get("lng");
  const address = sp.get("address") ?? "";

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng parameters required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    format: "json",
    lat,
    lon: lng,
    transit: "1",
    bike: "1",
    wsapikey: apiKey,
  });
  if (address) params.set("address", address);

  try {
    const res = await fetch(`${WALKSCORE_BASE}?${params}`);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Walk Score API returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.status !== 1) {
      return NextResponse.json(
        { error: "Walk Score unavailable for this location", status: data.status },
        { status: 404 }
      );
    }

    return NextResponse.json({
      walkScore: data.walkscore ?? null,
      walkDescription: data.description ?? null,
      transitScore: data.transit?.score ?? null,
      transitDescription: data.transit?.description ?? null,
      transitSummary: data.transit?.summary ?? null,
      bikeScore: data.bike?.score ?? null,
      bikeDescription: data.bike?.description ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to fetch Walk Score",
        detail: e instanceof Error ? e.message : "Unknown",
      },
      { status: 502 }
    );
  }
}
