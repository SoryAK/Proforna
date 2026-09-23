import { presentWorkMapPlace, type WorkMapPlace } from "./work-map";

export type GoogleGeocodeRead = {
  places: WorkMapPlace[];
  denied: boolean;
};

const DENIED = new Set(["REQUEST_DENIED", "OVER_DAILY_LIMIT", "OVER_QUERY_LIMIT"]);

export function readGoogleGeocode(payload: unknown): GoogleGeocodeRead {
  if (!payload || typeof payload !== "object") return { places: [], denied: false };
  const body = payload as { status?: unknown; results?: unknown };
  const status = typeof body.status === "string" ? body.status : "";
  if (DENIED.has(status)) return { places: [], denied: true };
  if (status !== "OK" || !Array.isArray(body.results)) return { places: [], denied: false };
  const places: WorkMapPlace[] = [];
  for (const hit of body.results) {
    const place = placeFromGoogleHit(hit);
    if (place) places.push(place);
    if (places.length === 5) break;
  }
  return { places, denied: false };
}

export function presentGoogleGeocode(payload: unknown): WorkMapPlace | null {
  return readGoogleGeocode(payload).places[0] ?? null;
}

function placeFromGoogleHit(hit: unknown): WorkMapPlace | null {
  if (!hit || typeof hit !== "object") return null;
  const result = hit as {
    formatted_address?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  };
  const address =
    typeof result.formatted_address === "string" ? result.formatted_address.trim() : "";
  const latitude = Number(result.geometry?.location?.lat);
  const longitude = Number(result.geometry?.location?.lng);
  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return presentWorkMapPlace({ displayName: address, latitude, longitude });
}
