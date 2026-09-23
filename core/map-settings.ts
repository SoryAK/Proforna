export type MapProvider = "openstreetmap" | "google";

export type MapSettings = {
  provider: MapProvider;
  googleMapsApiKey: string;
};

export type MapSettingsError = "provider-invalid" | "key-required";

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  provider: "openstreetmap",
  googleMapsApiKey: "",
};

export function prepareMapSettings(input: {
  provider?: unknown;
  googleMapsApiKey?: unknown;
}):
  | { ok: true; value: MapSettings }
  | { ok: false; error: MapSettingsError } {
  if (input.provider !== "openstreetmap" && input.provider !== "google") {
    return { ok: false, error: "provider-invalid" };
  }
  const googleMapsApiKey =
    typeof input.googleMapsApiKey === "string"
      ? input.googleMapsApiKey.trim()
      : "";
  if (input.provider === "google" && !googleMapsApiKey) {
    return { ok: false, error: "key-required" };
  }
  return {
    ok: true,
    value: { provider: input.provider, googleMapsApiKey },
  };
}
