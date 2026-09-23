import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("residences", () => {
  it("keeps several homes and leaves them out of a published resume", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {
      places: {
        lookup: async (query) => ({
          label: query,
          address: query,
          latitude: query.includes("Broadway") ? 39.92 : 39.85,
          longitude: query.includes("Broadway") ? -75.3 : -75.35,
        }),
      },
    });
    try {
      const first = await app.request("/api/residences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Dorm",
          address: "Chester, PA",
          startDate: "2018-08",
          endDate: "2020-12",
        }),
      });
      expect(first.status).toBe(201);

      const current = await app.request("/api/residences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Clifton",
          address: "67 E Broadway Ave, Clifton Heights, PA",
          startDate: "2024-06",
        }),
      });
      expect(current.status).toBe(201);

      const workMap = (await (await app.request("/api/work-map")).json()) as {
        residences: Array<{ label: string; endDate: string | null }>;
      };
      expect(workMap.residences.map((item) => item.label)).toEqual([
        "Dorm",
        "Clifton",
      ]);
      expect(workMap.residences[1].endDate).toBeNull();

      await app.request("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "homes",
          visibility: "unlisted",
          sections: ["profile", "history", "map"],
        }),
      });
      const published = await app.request("/api/work-map/publish", {
        method: "POST",
      });
      expect(published.status).toBe(201);
      const snapshot = JSON.stringify(await published.json());
      expect(snapshot).not.toContain("67 E Broadway");
      expect(snapshot).not.toContain("Chester, PA");
    } finally {
      db.close();
    }
  });

  it("saves a home when the address cannot be placed, then pins it later", async () => {
    const db = openDatabase(":memory:");
    let placed = false;
    const app = createApp(db, {
      places: {
        lookup: async (query) =>
          placed
            ? {
                label: query,
                address: query,
                latitude: 39.85,
                longitude: -75.35,
              }
            : null,
      },
    });
    try {
      const saved = await app.request("/api/residences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Dorm",
          address: "Chester, PA",
          startDate: "2018-08",
          endDate: "2020-12",
        }),
      });
      expect(saved.status).toBe(201);
      await expect(saved.json()).resolves.toMatchObject({
        residence: { label: "Dorm", latitude: null, longitude: null },
      });

      placed = true;
      const workMap = (await (await app.request("/api/work-map")).json()) as {
        residences: Array<{ latitude: number | null }>;
      };
      expect(workMap.residences[0]?.latitude).toBe(39.85);
    } finally {
      db.close();
    }
  });
});
