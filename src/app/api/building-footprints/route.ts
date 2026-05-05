import { NextResponse } from "next/server";

interface CoordRequest {
  id: string;
  lat: number;
  lng: number;
  /** Optional: if known, skip Overpass nearest-search and fetch this way directly */
  wayId?: number | null;
  /** Optional: explicit list of OSM way IDs to outline (multi-building campus).
   *  When provided and non-empty, takes precedence over `wayId` and the
   *  nearest-search fallback. Auto campus-sibling lookup is also skipped. */
  wayIds?: number[];
  /** Optional: caller-supplied polygon rings (e.g., user-drawn). Appended
   *  after any OSM rings in the result. */
  customRings?: LatLng[][];
  /** Optional: if true, never run the auto campus-sibling heuristic for this
   *  coord (even when no wayIds are supplied). The user has curated outlines. */
  suppressAuto?: boolean;
}

type LatLng = { lat: number; lng: number };
type Footprint = {
  id: string;
  /** Picked primary way (the building closest to / containing the coord) */
  wayId: number | null;
  /** Polygons (rings). First ring is the primary building; remaining rings are
   *  campus siblings that share name / operator / brand within ~80m. */
  polygons: LatLng[][];
};

/* ─────────────────── In-memory caches ─────────────────── */

// Coord-keyed cache stores the *full* footprint result (rings + wayId).
const coordCache = new Map<string, Footprint>();
// Way-keyed cache stores a single ring for direct wayId lookups.
const wayCache = new Map<number, LatLng[]>();

const cacheKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "resumsify/1.0 (https://resumsify.com; building-footprint-overlay)",
  Accept: "application/json",
};

/* ─────────────────── Geometry helpers ─────────────────── */

/** Point-in-polygon (ray-cast) for {lat,lng} rings. */
function pointInRing(pt: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat;
    const xj = ring[j].lng, yj = ring[j].lat;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringCentroid(ring: LatLng[]): LatLng {
  let sLat = 0, sLng = 0;
  for (const p of ring) { sLat += p.lat; sLng += p.lng; }
  return { lat: sLat / ring.length, lng: sLng / ring.length };
}

/** Approx meters between two LatLngs (equirectangular, fine for <500m). */
function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

/* ─────────────────── Overpass parsing ─────────────────── */

interface OverpassWay {
  id: number;
  nodeIds: number[];
  tags: Record<string, string>;
}

function parseOverpass(data: { elements?: { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> }[] }) {
  const nodes = new Map<number, LatLng>();
  const ways: OverpassWay[] = [];
  for (const el of data.elements ?? []) {
    if (el.type === "node" && el.lat != null && el.lon != null) {
      nodes.set(el.id, { lat: el.lat, lng: el.lon });
    } else if (el.type === "way" && (el.tags?.building || el.tags?.["building:part"])) {
      ways.push({ id: el.id, nodeIds: el.nodes ?? [], tags: el.tags });
    } else if (el.type === "way") {
      // Keep id-only ways (for direct wayId lookup where tags may be absent in skel)
      ways.push({ id: el.id, nodeIds: el.nodes ?? [], tags: el.tags ?? {} });
    }
  }
  return { nodes, ways };
}

function ringFromWay(way: OverpassWay, nodes: Map<number, LatLng>): LatLng[] {
  return way.nodeIds.map((nid) => nodes.get(nid)).filter(Boolean) as LatLng[];
}

/** Pick the best building for a coord: point-in-polygon → nearest-edge distance. */
function pickPrimary(coord: LatLng, ways: OverpassWay[], nodes: Map<number, LatLng>) {
  let bestWay: OverpassWay | null = null;
  let bestRing: LatLng[] | null = null;
  let bestScore = Infinity;

  for (const way of ways) {
    if (!way.tags?.building && !way.tags?.["building:part"]) continue;
    const ring = ringFromWay(way, nodes);
    if (ring.length < 3) continue;

    if (pointInRing(coord, ring)) {
      // Definitive hit — coord falls inside this building. Done.
      return { way, ring };
    }

    // Score by min vertex distance (proxy for nearest edge — good enough at building scale).
    let minDist = Infinity;
    for (const v of ring) {
      const d = metersBetween(coord, v);
      if (d < minDist) minDist = d;
    }
    if (minDist < bestScore) {
      bestScore = minDist;
      bestWay = way;
      bestRing = ring;
    }
  }
  if (!bestWay || !bestRing) return null;
  return { way: bestWay, ring: bestRing };
}

/** Find sibling buildings on the same campus: same name/operator/brand within 80m. */
function findCampusSiblings(
  primary: OverpassWay,
  primaryRing: LatLng[],
  ways: OverpassWay[],
  nodes: Map<number, LatLng>,
): LatLng[][] {
  const tags = ["name", "operator", "brand"] as const;
  const matchValues = new Map<string, string>();
  for (const t of tags) {
    if (primary.tags[t]) matchValues.set(t, primary.tags[t]);
  }
  if (matchValues.size === 0) return [];

  const primaryCentroid = ringCentroid(primaryRing);
  const siblings: LatLng[][] = [];
  for (const w of ways) {
    if (w.id === primary.id) continue;
    if (!w.tags?.building && !w.tags?.["building:part"]) continue;
    let isMatch = false;
    for (const [k, v] of matchValues) {
      if (w.tags[k] && w.tags[k] === v) { isMatch = true; break; }
    }
    if (!isMatch) continue;
    const ring = ringFromWay(w, nodes);
    if (ring.length < 3) continue;
    const distance = metersBetween(primaryCentroid, ringCentroid(ring));
    if (distance <= 80) siblings.push(ring);
  }
  return siblings;
}

/* ─────────────────── POST handler ─────────────────── */

// Public: returns OpenStreetMap building footprints near supplied coords.
// No auth — OSM data is public, and the public IR viewer needs this.
export async function POST(request: Request) {
  const body = await request.json();
  const coordinates: CoordRequest[] = body.coordinates ?? [];
  const radiusM: number = Math.min(Math.max(Number(body.radiusM) || 150, 30), 500);
  const noCache: boolean = body.noCache === true;

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return NextResponse.json({ error: "coordinates array required" }, { status: 400 });
  }

  const coords = coordinates.slice(0, 20);
  const results: Footprint[] = [];

  // Helper: append user-drawn custom rings to a footprint result.
  const withCustom = (fp: Footprint, c: CoordRequest): Footprint => {
    const custom = (c.customRings ?? []).filter((r) => Array.isArray(r) && r.length >= 3);
    if (custom.length === 0) return fp;
    return { ...fp, polygons: [...fp.polygons, ...custom] };
  };

  // ── Fast path: explicit wayIds[] or singular wayId (skip nearest-search). ──
  // For each coord, gather all way IDs we need to fetch.
  const multiNeed: { coord: CoordRequest; wayIds: number[]; primary: number | null }[] = [];
  const remaining: CoordRequest[] = [];
  const needWayLookupIds = new Set<number>();

  for (const c of coords) {
    const explicit = (c.wayIds ?? []).filter((n) => Number.isFinite(n) && n > 0);
    const single = c.wayId && Number.isFinite(c.wayId) ? Number(c.wayId) : null;
    const ids = explicit.length > 0 ? Array.from(new Set(explicit)) : single ? [single] : [];
    if (ids.length === 0) {
      remaining.push(c);
      continue;
    }
    multiNeed.push({ coord: c, wayIds: ids, primary: single ?? ids[0] });
    if (noCache) {
      ids.forEach((id) => needWayLookupIds.add(id));
    } else {
      ids.forEach((id) => { if (!wayCache.has(id)) needWayLookupIds.add(id); });
    }
  }

  if (needWayLookupIds.size > 0) {
    const idsList = Array.from(needWayLookupIds).join(",");
    const query = `[out:json][timeout:10];way(id:${idsList});out body;>;out skel qt;`;
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: OVERPASS_HEADERS,
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json();
        const { nodes, ways } = parseOverpass(data);
        for (const w of ways) {
          if (!needWayLookupIds.has(w.id)) continue;
          const ring = ringFromWay(w, nodes);
          if (ring.length >= 3) wayCache.set(w.id, ring);
        }
      }
    } catch {
      // Fall through — coord-based lookup will catch what we couldn't fetch.
    }
  }

  for (const { coord, wayIds, primary } of multiNeed) {
    const polygons: LatLng[][] = [];
    // Render primary first so client styling (idx===0) treats it as the main outline.
    const ordered = primary != null ? [primary, ...wayIds.filter((id) => id !== primary)] : wayIds;
    for (const id of ordered) {
      const ring = wayCache.get(id);
      if (ring && ring.length >= 3) polygons.push(ring);
    }
    if (polygons.length === 0) {
      // None of the explicit ways resolved — fall back to coord-based lookup
      // unless the caller suppressed auto.
      if (coord.suppressAuto) {
        results.push(withCustom({ id: coord.id, wayId: null, polygons: [] }, coord));
      } else {
        remaining.push(coord);
      }
    } else {
      results.push(withCustom({ id: coord.id, wayId: primary, polygons }, coord));
    }
  }

  // ── Coord lookups (with cache). Honors suppressAuto: emit empty result without firing Overpass. ──
  const toFetch: CoordRequest[] = [];
  for (const c of remaining) {
    if (c.suppressAuto) {
      results.push(withCustom({ id: c.id, wayId: null, polygons: [] }, c));
      continue;
    }
    const k = cacheKey(c.lat, c.lng);
    const hit = noCache ? undefined : coordCache.get(k);
    if (hit && hit.polygons.length > 0) {
      results.push(withCustom({ ...hit, id: c.id }, c));
    } else {
      toFetch.push(c);
    }
  }

  if (toFetch.length > 0) {
    // Query buildings within radius for all uncached coords in one Overpass call.
    const unionParts = toFetch.map(
      (c) => `way["building"](around:${radiusM},${c.lat},${c.lng});`,
    );
    const query = `[out:json][timeout:10];(${unionParts.join("")});out body;>;out skel qt;`;

    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: OVERPASS_HEADERS,
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        console.warn("[building-footprints] overpass non-OK:", res.status, await res.text().catch(() => ""));
        for (const c of toFetch) {
          const k = cacheKey(c.lat, c.lng);
          coordCache.set(k, { id: c.id, wayId: null, polygons: [] });
          results.push(withCustom({ id: c.id, wayId: null, polygons: [] }, c));
        }
      } else {
        const data = await res.json();
        const { nodes, ways } = parseOverpass(data);

        for (const c of toFetch) {
          const picked = pickPrimary({ lat: c.lat, lng: c.lng }, ways, nodes);
          if (!picked) {
            const fp: Footprint = { id: c.id, wayId: null, polygons: [] };
            coordCache.set(cacheKey(c.lat, c.lng), fp);
            results.push(withCustom(fp, c));
            continue;
          }
          const siblings = findCampusSiblings(picked.way, picked.ring, ways, nodes);
          const fp: Footprint = {
            id: c.id,
            wayId: picked.way.id,
            polygons: [picked.ring, ...siblings],
          };
          coordCache.set(cacheKey(c.lat, c.lng), fp);
          wayCache.set(picked.way.id, picked.ring);
          results.push(withCustom(fp, c));
        }
      }
    } catch (err) {
      console.warn("[building-footprints] overpass error:", err);
      for (const c of toFetch) {
        const k = cacheKey(c.lat, c.lng);
        coordCache.set(k, { id: c.id, wayId: null, polygons: [] });
        results.push(withCustom({ id: c.id, wayId: null, polygons: [] }, c));
      }
    }
  }

  return NextResponse.json({ footprints: results });
}
