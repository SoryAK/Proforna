import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ICONS, prepareMapSettings } from "./map-settings";

describe("prepareMapSettings", () => {
  it("keeps OpenStreetMap when no key is set", () => {
    expect(prepareMapSettings({ provider: "openstreetmap" })).toEqual({
      ok: true,
      value: {
        provider: "openstreetmap",
        googleMapsApiKey: "",
        theme: "kind",
        icons: DEFAULT_MAP_ICONS,
      },
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
      value: {
        provider: "google",
        googleMapsApiKey: "maps-key",
        theme: "kind",
        icons: DEFAULT_MAP_ICONS,
      },
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

  it("stores a pin theme and a mark the occupant chose", () => {
    expect(
      prepareMapSettings({
        provider: "openstreetmap",
        theme: "gold",
        icons: { school: "📚" },
      }),
    ).toEqual({
      ok: true,
      value: {
        provider: "openstreetmap",
        googleMapsApiKey: "",
        theme: "gold",
        icons: { ...DEFAULT_MAP_ICONS, school: "📚" },
      },
    });
  });

  it("rejects a theme or mark that cannot be drawn", () => {
    expect(prepareMapSettings({ provider: "openstreetmap", theme: "neon" })).toEqual({
      ok: false,
      error: "theme-invalid",
    });
    expect(
      prepareMapSettings({ provider: "openstreetmap", icons: { job: "<b>x</b>" } }),
    ).toEqual({ ok: false, error: "icon-invalid" });
  });
});
