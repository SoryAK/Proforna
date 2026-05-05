import { NextResponse } from "next/server";

/**
 * GET /api/building-footprints/nearby?lat=…&lng=…&radiusM=120
 *
 * Returns every OSM building polygon within `radiusM` meters of the given
 * coordinate so the user can pick which ones to outline. Lightweight wrapper
 * around Overpass — no caching (the picker UI runs once when opened).
 */

type LatLng = { lat: number; lng: number };

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "resumsify/1.0 (https://resumsify.com; building-footprint-picker)",
  Accept: "application/json",
};

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const radiusM = Math.min(Math.max(Number(url.searchParams.get("radiusM")) || 120, 30), 400);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const query = `[out:json][timeout:10];way["building"](around:${radiusM},${lat},${lng});out body;>;out skel qt;`;
  let data: { elements?: OverpassEl[] } = {};
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: OVERPASS_HEADERS,
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return NextResponse.json({ buildings: [] });
    }
    data = await res.json();
  } catch {
    return NextResponse.json({ buildings: [] });
  }

  const nodes = new Map<number, LatLng>();
  const ways: { id: number; nodeIds: number[]; tags: Record<string, string> }[] = [];
  for (const el of data.elements ?? []) {
    if (el.type === "node" && el.lat != null && el.lon != null) {
      nodes.set(el.id, { lat: el.lat, lng: el.lon });
    } else if (el.type === "way") {
      ways.push({ id: el.id, nodeIds: el.nodes ?? [], tags: el.tags ?? {} });
    }
  }

  const buildings = ways
    .map((w) => {
      const ring = w.nodeIds.map((nid) => nodes.get(nid)).filter(Boolean) as LatLng[];
      if (ring.length < 3) return null;
      // Centroid for distance sorting.
      let sLat = 0, sLng = 0;
      for (const p of ring) { sLat += p.lat; sLng += p.lng; }
      const centroid = { lat: sLat / ring.length, lng: sLng / ring.length };
      const dLat = (centroid.lat - lat) * 111320;
      const dLng = (centroid.lng - lng) * 111320 * Math.cos((lat * Math.PI) / 180);
      const distance = Math.sqrt(dLat * dLat + dLng * dLng);
      return {
        wayId: w.id,
        ring,
        name: w.tags.name ?? null,
        operator: w.tags.operator ?? null,
        brand: w.tags.brand ?? null,
        addr:
          [w.tags["addr:housenumber"], w.tags["addr:street"]].filter(Boolean).join(" ") || null,
        distanceM: Math.round(distance),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 50);

  return NextResponse.json({ buildings });
}
