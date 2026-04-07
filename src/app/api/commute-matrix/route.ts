import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/commute-matrix
 *
 * Uses ORS Matrix API to compute travel time from a single origin (home)
 * to many job destinations. Returns durations in minutes keyed by index.
 *
 * Body: { lat, lng, mode, destinations: [{ id, lat, lng }] }
 * Returns: { times: { [id]: minutes } }
 *
 * Free tier limits: 3500 cells/request, 500 req/day, 40/min.
 */

const ORS_KEY = process.env.ORS_API_KEY;

const VALID_MODES = new Set(["driving-car", "cycling-regular", "foot-walking"]);
const MAX_DESTINATIONS_PER_REQUEST = 3500; // ORS limit

type CacheEntry = { data: Record<string, number>; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min (commute times change with traffic)

interface DestInput {
  id: string;
  lat: number;
  lng: number;
}

export async function POST(req: NextRequest) {
  if (!ORS_KEY) {
    return NextResponse.json({ error: "ORS_API_KEY not configured" }, { status: 503 });
  }

  let body: { lat?: number; lng?: number; mode?: string; destinations?: DestInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lat, lng, mode = "driving-car", destinations } = body;

  if (typeof lat !== "number" || typeof lng !== "number" || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }
  if (!VALID_MODES.has(mode)) {
    return NextResponse.json({ error: `Invalid mode. Use: ${[...VALID_MODES].join(", ")}` }, { status: 400 });
  }
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return NextResponse.json({ error: "destinations required (non-empty array)" }, { status: 400 });
  }
  if (destinations.length > 5000) {
    return NextResponse.json({ error: "Too many destinations (max 5000)" }, { status: 400 });
  }

  // Validate each destination
  for (const d of destinations) {
    if (typeof d.lat !== "number" || typeof d.lng !== "number" || typeof d.id !== "string") {
      return NextResponse.json({ error: "Each destination needs id, lat, lng" }, { status: 400 });
    }
  }

  // Check cache (round coords to 4 decimal places for cache key)
  const cacheKey = `matrix:${lat.toFixed(4)},${lng.toFixed(4)},${mode},${destinations.length}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    // Verify same destinations (by checking first/last IDs + count)
    const firstId = destinations[0].id;
    const lastId = destinations[destinations.length - 1].id;
    if (cached.data[firstId] !== undefined && cached.data[lastId] !== undefined) {
      return NextResponse.json({ times: cached.data });
    }
  }

  try {
    const allTimes: Record<string, number> = {};

    // Chunk if needed (1 source + N destinations → N cells)
    for (let i = 0; i < destinations.length; i += MAX_DESTINATIONS_PER_REQUEST) {
      const chunk = destinations.slice(i, i + MAX_DESTINATIONS_PER_REQUEST);

      // ORS uses [lng, lat] order
      const locations = [
        [lng, lat], // source (home)
        ...chunk.map((d) => [d.lng, d.lat]),
      ];

      const res = await fetch(
        `https://api.openrouteservice.org/v2/matrix/${mode}`,
        {
          method: "POST",
          headers: {
            Authorization: ORS_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locations,
            sources: [0], // only the home location
            destinations: chunk.map((_, idx) => idx + 1), // all job indices
            metrics: ["duration"],
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("ORS matrix error:", res.status, text);
        return NextResponse.json({ error: "Matrix service error" }, { status: 502 });
      }

      const data = await res.json();
      const durations: number[] = data?.durations?.[0]; // single row (one source)

      if (!durations) {
        console.error("ORS matrix: no durations in response");
        return NextResponse.json({ error: "Unexpected matrix response" }, { status: 502 });
      }

      chunk.forEach((dest, idx) => {
        const seconds = durations[idx];
        // ORS returns null for unreachable destinations
        allTimes[dest.id] = seconds != null ? Math.round(seconds / 60) : -1;
      });
    }

    cache.set(cacheKey, { data: allTimes, fetchedAt: Date.now() });

    return NextResponse.json({ times: allTimes });
  } catch (err) {
    console.error("Matrix fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch matrix" }, { status: 500 });
  }
}
