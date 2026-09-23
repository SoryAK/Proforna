import { readGoogleGeocode, type GoogleGeocodeRead } from "../core/google-geocode";
import type { WorkMapPlace } from "../core/work-map";

export async function lookupGooglePlaces(
  query: string,
  apiKey: string,
): Promise<GoogleGeocodeRead> {
  return requestGoogle({ address: query }, apiKey);
}

export async function reverseGooglePlace(
  latitude: number,
  longitude: number,
  apiKey: string,
): Promise<GoogleGeocodeRead> {
  return requestGoogle({ latlng: `${latitude},${longitude}` }, apiKey);
}

export async function lookupGooglePlace(
  query: string,
  apiKey: string,
): Promise<WorkMapPlace | null> {
  const read = await lookupGooglePlaces(query, apiKey);
  return read.places[0] ?? null;
}

async function requestGoogle(
  params: Record<string, string>,
  apiKey: string,
): Promise<GoogleGeocodeRead> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey);
  const response = await fetch(url);
  if (!response.ok) return { places: [], denied: true };
  return readGoogleGeocode(await response.json());
}
