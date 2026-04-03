import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { cached, TTL } from "@/lib/cache";

/**
 * Commute estimate with multi-modal support.
 *
 * Tries Google Directions API first (driving, transit, walking, bicycling).
 * Falls back to OSRM (driving only) if no Google key or Google fails.
 * Final fallback: haversine straight-line estimate.
 *
 * GET ?fromLat=39.9&fromLng=-75.1&toLat=40.0&toLng=-75.2&mode=driving
 *   → { durationMin: 32, distanceMi: 18.5, mode: "driving" }
 *
 * GET ?fromLat=...&toLat=...&mode=transit&geometry=true
 *   → { durationMin: 45, distanceMi: 18.5, mode: "transit", geometry: [[lat,lng],...] }
 */

type CommuteMode = "driving" | "transit" | "walking" | "bicycling";
const VALID_MODES: CommuteMode[] = ["driving", "transit", "walking", "bicycling"];

/** Decode Google-style polyline (precision 5 for Google, 6 for OSRM) → [lat, lng][] */
function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const coords: [number, number][] = [];
  const factor = Math.pow(10, precision);
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

    coords.push([lat / factor, lng / factor]);
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
  mode: CommuteMode = "driving",
) {
  const straightMi = haversineDistanceMi(fromLat, fromLng, toLat, toLng);
  // Speed estimates by mode (mph average)
  const speeds: Record<CommuteMode, number> = { driving: 30, transit: 20, walking: 3.1, bicycling: 12 };
  const detourFactors: Record<CommuteMode, number> = { driving: 1.3, transit: 1.4, walking: 1.2, bicycling: 1.25 };
  const distanceMi = Math.round(straightMi * detourFactors[mode] * 10) / 10;
  const durationMin = Math.round((distanceMi / speeds[mode]) * 60);
  return { durationMin, distanceMi, mode, estimated: true };
}

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

/** A single step in a transit itinerary (walking or transit leg) */
interface TransitStep {
  mode: "WALKING" | "TRANSIT";
  durationMin: number;
  distanceMi: number;
  geometry?: [number, number][];
  /* Walking-specific */
  instructions?: string;
  /* Transit-specific */
  lineName?: string;       // e.g. "Route 109"
  lineShort?: string;      // e.g. "109"
  vehicleType?: string;    // BUS, SUBWAY, RAIL, TRAM, COMMUTER_TRAIN, etc.
  vehicleIcon?: string;    // URL to vehicle icon
  lineColor?: string;      // hex color e.g. "#0055A4"
  lineTextColor?: string;  // hex color for text on the line badge
  agencyName?: string;     // e.g. "SEPTA"
  departureStop?: string;
  departureTime?: string;  // "5:37 AM"
  arrivalStop?: string;
  arrivalTime?: string;
  numStops?: number;
}

/** A single route option from the Directions API */
interface RouteOption {
  durationMin: number;
  distanceMi: number;
  summary: string; // e.g. "via I-476 N"
  durationInTrafficMin?: number;
  geometry?: [number, number][];
  transitSteps?: TransitStep[];
}

/** Try Google Directions API — returns primary route + alternatives */
async function tryGoogleDirections(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: CommuteMode,
  wantGeometry: boolean,
  opts?: { alternatives?: boolean; departureTime?: number; avoidTolls?: boolean },
): Promise<{
  durationMin: number; distanceMi: number; mode: CommuteMode;
  durationInTrafficMin?: number; geometry?: [number, number][];
  routes?: RouteOption[];
} | null> {
  if (!GOOGLE_KEY) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${fromLat},${fromLng}`);
  url.searchParams.set("destination", `${toLat},${toLng}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", GOOGLE_KEY);
  if (opts?.alternatives) url.searchParams.set("alternatives", "true");
  if (opts?.avoidTolls) url.searchParams.set("avoid", "tolls");
  // departure_time: seconds since epoch
  // For driving → enables duration_in_traffic; for transit → enables schedule-based results
  if (opts?.departureTime && (mode === "driving" || mode === "transit")) {
    url.searchParams.set("departure_time", String(opts.departureTime));
  }

  try {
    const res = await fetchWithTimeout(url.toString(), 10000);
    const data = await res.json();

    if (data.status !== "OK" || !data.routes?.length) return null;

    // Parse all routes (up to 3 alternatives from Google)
    const allRoutes: RouteOption[] = data.routes.map((r: any) => {
      const leg = r.legs[0];
      const opt: RouteOption = {
        durationMin: Math.round(leg.duration.value / 60),
        distanceMi: Math.round((leg.distance.value / 1609.34) * 10) / 10,
        summary: r.summary || "",
      };
      if (leg.duration_in_traffic) {
        opt.durationInTrafficMin = Math.round(leg.duration_in_traffic.value / 60);
      }
      if (wantGeometry) {
        // Prefer step-level polylines (road-accurate) over overview_polyline (simplified)
        if (leg.steps?.length) {
          const stepCoords: [number, number][] = [];
          for (const step of leg.steps) {
            if (step.polyline?.points) {
              const decoded = decodePolyline(step.polyline.points, 5);
              // Skip first point of subsequent steps to avoid duplicates at junctions
              stepCoords.push(...(stepCoords.length > 0 ? decoded.slice(1) : decoded));
            }
          }
          if (stepCoords.length > 1) {
            opt.geometry = simplifyGeometry(stepCoords, 500);
          }
        }
        // Fallback to overview polyline if step decoding failed
        if (!opt.geometry && r.overview_polyline?.points) {
          opt.geometry = simplifyGeometry(decodePolyline(r.overview_polyline.points, 5), 500);
        }
      }

      // Parse transit step details (walking + transit legs)
      if (mode === "transit" && leg.steps?.length) {
        opt.transitSteps = leg.steps.map((step: any) => {
          const ts: TransitStep = {
            mode: step.travel_mode === "TRANSIT" ? "TRANSIT" : "WALKING",
            durationMin: Math.round(step.duration.value / 60),
            distanceMi: Math.round((step.distance.value / 1609.34) * 10) / 10,
          };
          if (wantGeometry && step.polyline?.points) {
            ts.geometry = simplifyGeometry(decodePolyline(step.polyline.points, 5), 80);
          }
          if (step.travel_mode === "WALKING") {
            ts.instructions = step.html_instructions?.replace(/<[^>]*>/g, "") || "Walk";
          }
          if (step.travel_mode === "TRANSIT" && step.transit_details) {
            const td = step.transit_details;
            const line = td.line;
            ts.lineName = line?.name || undefined;
            ts.lineShort = line?.short_name || undefined;
            ts.vehicleType = line?.vehicle?.type || undefined;
            ts.vehicleIcon = line?.vehicle?.icon ? `https:${line.vehicle.icon}` : undefined;
            ts.lineColor = line?.color || undefined;
            ts.lineTextColor = line?.text_color || undefined;
            ts.agencyName = line?.agencies?.[0]?.name || undefined;
            ts.departureStop = td.departure_stop?.name || undefined;
            ts.departureTime = td.departure_time?.text || undefined;
            ts.arrivalStop = td.arrival_stop?.name || undefined;
            ts.arrivalTime = td.arrival_time?.text || undefined;
            ts.numStops = td.num_stops || undefined;
          }
          return ts;
        });

        // Build summary from transit line names if no route summary
        if (!opt.summary && opt.transitSteps) {
          const transitLegs = opt.transitSteps.filter((s) => s.mode === "TRANSIT");
          opt.summary = transitLegs.map((s) => s.lineShort || s.lineName || "").filter(Boolean).join(" → ");
        }
      }

      return opt;
    });

    const primary = allRoutes[0];
    const result: any = {
      durationMin: primary.durationMin,
      distanceMi: primary.distanceMi,
      mode,
    };
    if (primary.durationInTrafficMin) result.durationInTrafficMin = primary.durationInTrafficMin;
    if (primary.geometry) result.geometry = primary.geometry;
    if (primary.transitSteps) result.transitSteps = primary.transitSteps;
    if (allRoutes.length > 1) result.routes = allRoutes;

    return result;
  } catch {
    return null;
  }
}

/** Try OSRM (driving only) */
async function tryOsrm(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  wantGeometry: boolean,
): Promise<{ durationMin: number; distanceMi: number; mode: CommuteMode; geometry?: [number, number][] } | null> {
  try {
    const overview = wantGeometry ? "full" : "false";
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=${overview}&geometries=polyline6`;
    const res = await fetchWithTimeout(url);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes?.length) return null;

    const route = data.routes[0];
    const durationMin = Math.round(route.duration / 60);
    const distanceMi = Math.round((route.distance / 1609.34) * 10) / 10;

    if (!wantGeometry) return { durationMin, distanceMi, mode: "driving" };

    // OSRM uses precision 6
    const raw = route.geometry ? decodePolyline(route.geometry, 6) : [];
    const geometry = simplifyGeometry(raw);

    return { durationMin, distanceMi, mode: "driving", geometry };
  } catch {
    return null;
  }
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
  const wantAlternatives = sp.get("alternatives") === "true";
  const avoidTolls = sp.get("avoidTolls") === "true";
  const departureTime = sp.get("departureTime"); // epoch seconds
  const modeParam = sp.get("mode") ?? "driving";
  const mode: CommuteMode = VALID_MODES.includes(modeParam as CommuteMode)
    ? (modeParam as CommuteMode)
    : "driving";

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

  // Separate cache keys for mode + geometry + options
  const optsKey = `${avoidTolls ? "nt" : ""}${wantAlternatives ? "alt" : ""}${departureTime ?? ""}`;
  const cacheKey = `commute:${fromLat}:${fromLng}:${toLat}:${toLng}:${mode}:${wantGeometry ? "geo" : "fast"}:${optsKey}`;

  try {
    const result = await cached(cacheKey, TTL.COMMUTE, async () => {
      // 1. Try Google Directions (supports all modes, alternatives, traffic)
      const google = await tryGoogleDirections(
        coords[0], coords[1], coords[2], coords[3], mode, wantGeometry,
        {
          alternatives: wantAlternatives,
          avoidTolls,
          departureTime: departureTime ? Number(departureTime) : undefined,
        },
      );
      if (google) return google;

      // 2. OSRM fallback (driving only)
      if (mode === "driving") {
        const osrm = await tryOsrm(coords[0], coords[1], coords[2], coords[3], wantGeometry);
        if (osrm) return osrm;
      }

      // 3. Straight-line estimate as final fallback
      return straightLineEstimate(coords[0], coords[1], coords[2], coords[3], mode);
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      straightLineEstimate(coords[0], coords[1], coords[2], coords[3], mode),
    );
  }
}
