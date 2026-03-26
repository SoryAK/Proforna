import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached, TTL } from "@/lib/cache";

/**
 * Commute estimate via OSRM public demo server (free, no key).
 *
 * GET ?fromLat=39.9&fromLng=-75.1&toLat=40.0&toLng=-75.2
 *   → { durationMin: 32, distanceMi: 18.5 }                  (fast — no geometry)
 *
 * GET ?fromLat=...&toLat=...&geometry=true
 *   → { durationMin: 32, distanceMi: 18.5, geometry: [[lat,lng],...] }
 *
 * Two-phase design: client fetches duration first, then full geometry in background.
 */

/** Decode Google-style polyline6 (OSRM default precision=6) → [lat, lng][] */
function decodePolyline6(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / 1e6, lng / 1e6]);
  }
  return coords;
}

/** Downsample a coordinate array to at most `maxPoints` evenly spaced points,
 *  always keeping first and last. */
function simplifyGeometry(
  coords: [number, number][],
  maxPoints = 150,
): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  result.push(coords[coords.length - 1]);
  return result;
}

/** Timeout wrapper for fetch — abort after `ms` */
async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Haversine straight-line distance in miles */
function haversineDistanceMi(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Estimate driving distance/time from straight-line distance (no routing service) */
function straightLineEstimate(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
) {
  const straightMi = haversineDistanceMi(fromLat, fromLng, toLat, toLng);
  // Roads add ~30% over straight-line distance
  const distanceMi = Math.round(straightMi * 1.3 * 10) / 10;
  // Estimate ~30 mph average driving speed for suburban/urban
  const durationMin = Math.round((distanceMi / 30) * 60);
  return { durationMin, distanceMi, estimated: true };
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const fromLat = sp.get("fromLat");
  const fromLng = sp.get("fromLng");
  const toLat = sp.get("toLat");
  const toLng = sp.get("toLng");
  const wantGeometry = sp.get("geometry") === "true";

  if (!fromLat || !fromLng || !toLat || !toLng)
    return NextResponse.json(
      { error: "Provide fromLat, fromLng, toLat, toLng" },
      { status: 400 },
    );

  // Validate coordinates are numbers in valid range
  const coords = [fromLat, fromLng, toLat, toLng].map(Number);
  if (coords.some(isNaN))
    return NextResponse.json(
      { error: "Coordinates must be numbers" },
      { status: 400 },
    );

  // Separate cache keys for with/without geometry so the fast path stays fast
  const cacheKey = `commute:${fromLat}:${fromLng}:${toLat}:${toLng}:${wantGeometry ? "geo" : "fast"}`;

  try {
    const result = await cached(cacheKey, TTL.COMMUTE, async () => {
      try {
        // overview=false is ~2-4× faster on OSRM; only request full when client needs geometry
        const overview = wantGeometry ? "full" : "false";
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=${overview}&geometries=polyline6`;
        const res = await fetchWithTimeout(url);
        const data = await res.json();

        if (data.code !== "Ok" || !data.routes?.length)
          throw new Error("No route found");

        const route = data.routes[0];
        const durationMin = Math.round(route.duration / 60);
        const distanceMi = Math.round((route.distance / 1609.34) * 10) / 10;

        if (!wantGeometry) return { durationMin, distanceMi };

        // Decode & simplify geometry to keep payload small
        const raw = route.geometry ? decodePolyline6(route.geometry) : [];
        const geometry = simplifyGeometry(raw);

        return { durationMin, distanceMi, geometry };
      } catch {
        // OSRM down/timed-out → fall back to straight-line estimate (no geometry)
        return straightLineEstimate(coords[0], coords[1], coords[2], coords[3]);
      }
    });

    return NextResponse.json(result);
  } catch {
    // Fallback should mean we rarely get here, but just in case
    return NextResponse.json(
      straightLineEstimate(coords[0], coords[1], coords[2], coords[3]),
    );
  }
}
