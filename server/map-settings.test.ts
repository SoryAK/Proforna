import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("map settings", () => {
  it("stores a personal Google Maps key and leaves it out of a published snapshot", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, { places: { lookup: async () => null } });
    try {
      const saved = await app.request("/api/maps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          googleMapsApiKey: "personal-maps-key",
        }),
      });
      expect(saved.status).toBe(200);
      await expect(saved.json()).resolves.toEqual({
        settings: { provider: "google", googleMapsApiKey: "personal-maps-key" },
      });

      const read = await app.request("/api/maps");
      await expect(read.json()).resolves.toEqual({
        settings: { provider: "google", googleMapsApiKey: "personal-maps-key" },
      });

      const missing = await app.request("/api/maps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", googleMapsApiKey: "" }),
      });
      expect(missing.status).toBe(400);

      await app.request("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "maps",
          visibility: "unlisted",
          sections: ["profile", "history"],
        }),
      });
      const published = await app.request("/api/work-map/publish", { method: "POST" });
      expect(published.status).toBe(201);
      expect(JSON.stringify(await published.json())).not.toContain("personal-maps-key");
    } finally {
      db.close();
    }
  });

  it("looks up an address with the saved Google key", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, { places: { lookup: async () => null } });
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        "https://maps.googleapis.com/maps/api/geocode/json",
      );
      expect(url.searchParams.get("key")).toBe("personal-maps-key");
      const latlng = url.searchParams.get("latlng");
      const formatted = latlng
        ? "67 E Broadway Ave, Clifton Heights, PA 19018, USA"
        : "67 E Broadway Ave, Clifton Heights, PA 19018, USA";
      if (!latlng) {
        expect(url.searchParams.get("address")).toBe(
          "67 E Broadway Ave, Clifton Heights, PA",
        );
      }
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: formatted,
              geometry: { location: { lat: 39.928845, lng: -75.2932877 } },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      await app.request("/api/maps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          googleMapsApiKey: "personal-maps-key",
        }),
      });
      const found = await app.request(
        "/api/work-map/places?q=67%20E%20Broadway%20Ave%2C%20Clifton%20Heights%2C%20PA",
      );
      expect(found.status).toBe(200);
      await expect(found.json()).resolves.toEqual({
        place: {
          label: "67 E Broadway Ave",
          address: "67 E Broadway Ave, Clifton Heights, PA 19018, USA",
          latitude: 39.928845,
          longitude: -75.2932877,
        },
        places: [
          {
            label: "67 E Broadway Ave",
            address: "67 E Broadway Ave, Clifton Heights, PA 19018, USA",
            latitude: 39.928845,
            longitude: -75.2932877,
          },
        ],
        source: "google",
        googleLookup: "ok",
      });
      const reversed = await app.request(
        "/api/work-map/places?lat=39.928845&lng=-75.2932877",
      );
      expect(reversed.status).toBe(200);
      await expect(reversed.json()).resolves.toMatchObject({
        source: "google",
        place: { address: "67 E Broadway Ave, Clifton Heights, PA 19018, USA" },
      });
    } finally {
      globalThis.fetch = original;
      db.close();
    }
  });

  it("uses OpenStreetMap addresses when Google refuses the lookup", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {
      places: {
        lookup: async () => ({
          label: "Clifton Heights",
          address: "Clifton Heights, PA",
          latitude: 39.92,
          longitude: -75.29,
        }),
      },
    });
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "REQUEST_DENIED", results: [] }), {
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      await app.request("/api/maps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          googleMapsApiKey: "personal-maps-key",
        }),
      });
      const found = await app.request("/api/work-map/places?q=Broadway");
      expect(found.status).toBe(200);
      await expect(found.json()).resolves.toMatchObject({
        source: "openstreetmap",
        googleLookup: "unavailable",
        place: { address: "Clifton Heights, PA" },
      });
      const status = await app.request("/api/maps/lookup-status");
      await expect(status.json()).resolves.toEqual({ googleLookup: "unavailable" });
    } finally {
      globalThis.fetch = original;
      db.close();
    }
  });
});
