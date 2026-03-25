import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached, TTL } from "@/lib/cache";

/**
 * Commute estimate via OSRM public demo server (free, no key).
 * GET ?fromLat=39.9&fromLng=-75.1&toLat=40.0&toLng=-75.2
 * → { durationMin: 32, distanceMi: 18.5, geometry: [[lat,lng],...] }
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

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const fromLat = sp.get("fromLat");
  const fromLng = sp.get("fromLng");
  const toLat = sp.get("toLat");
  const toLng = sp.get("toLng");

  if (!fromLat || !fromLng || !toLat || !toLng)
    return NextResponse.json(
      { error: "Provide fromLat, fromLng, toLat, toLng" },
      { status: 400 }
    );

  // Validate coordinates are numbers in valid range
  const coords = [fromLat, fromLng, toLat, toLng].map(Number);
  if (coords.some(isNaN))
    return NextResponse.json(
      { error: "Coordinates must be numbers" },
      { status: 400 }
    );

  const cacheKey = `commute:${fromLat}:${fromLng}:${toLat}:${toLng}`;

  try {
    const result = await cached(cacheKey, TTL.COMMUTE, async () => {
      // OSRM uses lng,lat order — request full geometry
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=polyline6`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code !== "Ok" || !data.routes?.length)
        throw { status: 404, error: "No route found" };

      const route = data.routes[0];
      const durationMin = Math.round(route.duration / 60);
      const distanceMi = Math.round((route.distance / 1609.34) * 10) / 10;

      // Decode polyline6 geometry into [[lat, lng], ...]
      const geometry = route.geometry ? decodePolyline6(route.geometry) : [];

      return { durationMin, distanceMi, geometry };
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; error?: string };
    if (e.status === 404)
      return NextResponse.json({ error: e.error }, { status: 404 });
    return NextResponse.json(
      { error: "Routing service unavailable" },
      { status: 502 }
    );
  }
}
