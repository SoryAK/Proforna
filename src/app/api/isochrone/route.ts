import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/isochrone?lat=40.7&lng=-74.0&miles=25&mode=driving-car
 *
 * Returns TIME-based isochrone rings that expand outward from the given point
 * until they roughly cover the search radius in miles.
 *
 * Time bands are generated at regular intervals (e.g. every 10 min) based on
 * an estimated travel rate for the mode, so the user sees how many minutes
 * each part of their search area is from home.
 *
 * Modes: driving-car | cycling-regular | foot-walking
 * Requires ORS_API_KEY in env. Free: https://openrouteservice.org/dev/#/signup
 */

const ORS_KEY = process.env.ORS_API_KEY;

type CacheEntry = { data: unknown; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

const VALID_MODES = new Set(["driving-car", "cycling-regular", "foot-walking"]);

/** Avg minutes per mile for each mode (conservative estimates for mixed roads) */
const MIN_PER_MILE: Record<string, number> = {
  "driving-car": 2,        // ~30 mph avg
  "cycling-regular": 5,    // ~12 mph avg
  "foot-walking": 20,      // ~3 mph avg
};

/**
 * Build time-based ranges (in seconds) that cover `miles` for the given mode.
 * Produces evenly-spaced time bands, capped at 10 ranges and 60 min (ORS free tier limit).
 */
function buildTimeRanges(miles: number, mode: string): number[] {
  const rate = MIN_PER_MILE[mode] ?? 2;
  const maxMinutes = Math.min(60, Math.ceil(miles * rate));

  // Choose a step that gives 4-6 bands
  let step: number;
  if (maxMinutes <= 15) step = 5;
  else if (maxMinutes <= 40) step = 10;
  else if (maxMinutes <= 80) step = 15;
  else step = 20;

  const ranges: number[] = [];
  for (let m = step; m <= maxMinutes; m += step) {
    ranges.push(m * 60); // seconds
  }
  // Ensure max is included
  if (ranges.length === 0 || ranges[ranges.length - 1] !== maxMinutes * 60) {
    ranges.push(maxMinutes * 60);
  }
  return ranges.slice(0, 10);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get("lat") ?? "");
  const lng = parseFloat(sp.get("lng") ?? "");
  const miles = parseFloat(sp.get("miles") ?? "25");
  const mode = sp.get("mode") ?? "driving-car";

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }
  if (isNaN(miles) || miles < 1 || miles > 100) {
    return NextResponse.json({ error: "miles must be 1-100" }, { status: 400 });
  }
  if (!VALID_MODES.has(mode)) {
    return NextResponse.json({ error: `Invalid mode. Use: ${[...VALID_MODES].join(", ")}` }, { status: 400 });
  }
  if (!ORS_KEY) {
    return NextResponse.json({ error: "ORS_API_KEY not configured" }, { status: 503 });
  }

  const rangesArr = buildTimeRanges(miles, mode);
  const cacheKey = `time:${lat.toFixed(4)},${lng.toFixed(4)},${rangesArr.join("-")},${mode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=21600" },
    });
  }

  try {
    const res = await fetch(
      `https://api.openrouteservice.org/v2/isochrones/${mode}`,
      {
        method: "POST",
        headers: {
          Authorization: ORS_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locations: [[lng, lat]], // ORS uses [lng, lat]
          range: rangesArr,
          range_type: "time",
          smoothing: 25,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("ORS isochrone error:", res.status, text);
      return NextResponse.json({ error: "Isochrone service error" }, { status: 502 });
    }

    const geojson = await res.json();
    const features = geojson?.features;
    if (!features || features.length === 0) {
      return NextResponse.json({ error: "No isochrone data" }, { status: 404 });
    }

    // ORS returns features from largest to smallest range
    // properties.value = time in seconds
    const result = {
      rings: features.map((f: { geometry: unknown; properties?: { value?: number } }) => ({
        minutes: Math.round((f.properties?.value ?? 0) / 60),
        geometry: f.geometry,
      })),
      center: { lat, lng },
      mode,
      maxMiles: miles,
    };

    cache.set(cacheKey, { data: result, fetchedAt: Date.now() });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=21600" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch isochrone" }, { status: 500 });
  }
}
