import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

interface Coordinate {
  id: string;
  lat: number;
  lng: number;
}

// In-memory cache keyed by rounded lat,lng → polygon rings
const cache = new Map<string, { lat: number; lng: number }[][]>();

function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const coordinates: Coordinate[] = body.coordinates ?? [];

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return NextResponse.json({ error: "coordinates array required" }, { status: 400 });
  }

  // Cap to 20 coordinates per request
  const coords = coordinates.slice(0, 20);
  const results: { id: string; polygons: { lat: number; lng: number }[][] }[] = [];

  // Check cache first, collect uncached
  const toFetch: Coordinate[] = [];
  for (const c of coords) {
    const k = cacheKey(c.lat, c.lng);
    const hit = cache.get(k);
    if (hit) {
      results.push({ id: c.id, polygons: hit });
    } else {
      toFetch.push(c);
    }
  }

  if (toFetch.length > 0) {
    // Build Overpass query for all uncached coordinates at once
    const radiusM = 40;
    const unionParts = toFetch.map(
      (c) => `way["building"](around:${radiusM},${c.lat},${c.lng});`
    );
    const query = `[out:json][timeout:10];(${unionParts.join("")});out body;>;out skel qt;`;

    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const data = await res.json();
        const nodes = new Map<number, { lat: number; lng: number }>();
        const ways: { id: number; nodeIds: number[]; tags?: Record<string, string> }[] = [];

        for (const el of data.elements ?? []) {
          if (el.type === "node") {
            nodes.set(el.id, { lat: el.lat, lng: el.lon });
          } else if (el.type === "way" && el.tags?.building) {
            ways.push({ id: el.id, nodeIds: el.nodes ?? [], tags: el.tags });
          }
        }

        // For each coordinate, find the closest building way by centroid distance
        for (const c of toFetch) {
          const polygons: { lat: number; lng: number }[][] = [];
          let bestDist = Infinity;
          let bestRing: { lat: number; lng: number }[] | null = null;

          for (const way of ways) {
            const ring = way.nodeIds
              .map((nid) => nodes.get(nid))
              .filter(Boolean) as { lat: number; lng: number }[];
            if (ring.length < 3) continue;

            // Centroid
            const cLat = ring.reduce((s, n) => s + n.lat, 0) / ring.length;
            const cLng = ring.reduce((s, n) => s + n.lng, 0) / ring.length;
            const dist = Math.sqrt((cLat - c.lat) ** 2 + (cLng - c.lng) ** 2);

            if (dist < bestDist) {
              bestDist = dist;
              bestRing = ring;
            }
          }

          if (bestRing) polygons.push(bestRing);
          const k = cacheKey(c.lat, c.lng);
          cache.set(k, polygons);
          results.push({ id: c.id, polygons });
        }
      } else {
        // Overpass returned error — cache empty for all
        for (const c of toFetch) {
          const k = cacheKey(c.lat, c.lng);
          cache.set(k, []);
          results.push({ id: c.id, polygons: [] });
        }
      }
    } catch {
      // Timeout or network error — cache empty
      for (const c of toFetch) {
        const k = cacheKey(c.lat, c.lng);
        cache.set(k, []);
        results.push({ id: c.id, polygons: [] });
      }
    }
  }

  return NextResponse.json({ footprints: results });
}
