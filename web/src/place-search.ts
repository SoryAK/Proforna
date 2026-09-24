export function splitPlaceAddress(address: string): {
  street: string;
  city: string;
  state: string;
  label: string;
} {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (/^(usa|united states)$/i.test(parts[parts.length - 1] ?? "")) parts.pop();
  return {
    street: parts[0] ?? address,
    city: parts[1] ?? "",
    state: (parts[2] ?? "").replace(/\s+\d[\d\s-]*$/, "").trim(),
    label: parts.join(", ") || address,
  };
}

export type PlaceHit = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type PlaceSearch = {
  places: PlaceHit[];
  place: PlaceHit | null;
  source: "google" | "openstreetmap";
  googleLookup: "ok" | "unavailable" | "unused";
};

export async function searchPlaces(query: string): Promise<PlaceSearch | null> {
  const response = await fetch(`/api/work-map/places?q=${encodeURIComponent(query)}`);
  return readPlaceSearch(response);
}

export async function reversePlace(
  latitude: number,
  longitude: number,
): Promise<PlaceSearch | null> {
  const response = await fetch(
    `/api/work-map/places?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`,
  );
  return readPlaceSearch(response);
}

export function lookupNote(result: PlaceSearch): string {
  if (result.googleLookup !== "unavailable") return "";
  if (result.places.length > 0) {
    return "Address found with OpenStreetMap. Google could not look up addresses until the Geocoding API is enabled.";
  }
  return "Google could not look up addresses. Enable the Geocoding API on your key.";
}

async function readPlaceSearch(response: Response): Promise<PlaceSearch | null> {
  const body = (await response.json()) as Partial<PlaceSearch>;
  if (body.googleLookup !== "ok" && body.googleLookup !== "unavailable" && body.googleLookup !== "unused") {
    return null;
  }
  const places = Array.isArray(body.places) ? body.places : [];
  return {
    places,
    place: body.place ?? places[0] ?? null,
    source: body.source === "google" ? "google" : "openstreetmap",
    googleLookup: body.googleLookup,
  };
}
