import { describe, expect, it } from "vitest";
import { prepareMapSettings } from "./map-settings";

describe("prepareMapSettings", () => {
  it("keeps OpenStreetMap when no key is set", () => {
    expect(prepareMapSettings({ provider: "openstreetmap" })).toEqual({
      ok: true,
      value: { provider: "openstreetmap", googleMapsApiKey: "" },
    });
  });

  it("stores a Google key for the occupant's own map", () => {
    expect(
      prepareMapSettings({
        provider: "google",
        googleMapsApiKey: "  maps-key  ",
      }),
    ).toEqual({
      ok: true,
      value: { provider: "google", googleMapsApiKey: "maps-key" },
    });
  });

  it("requires a key before Google Maps can be selected", () => {
    expect(prepareMapSettings({ provider: "google", googleMapsApiKey: " " })).toEqual({
      ok: false,
      error: "key-required",
    });
  });

  it("rejects an unknown provider", () => {
    expect(prepareMapSettings({ provider: "mapbox" })).toEqual({
      ok: false,
      error: "provider-invalid",
    });
  });
});
