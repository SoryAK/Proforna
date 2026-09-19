import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { ProjectionRelay, RelayProjection } from "./projections";

describe("interactive projections HTTP seam", () => {
  it("makes the retired resume source optional in existing vaults", () => {
    const directory = mkdtempSync(join(tmpdir(), "proforna-projection-"));
    const path = join(directory, "vault.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE occupants (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE interactive_projections (
        id TEXT PRIMARY KEY,
        occupant_id TEXT NOT NULL REFERENCES occupants(id),
        revision_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        visibility TEXT NOT NULL,
        projection_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(occupant_id, slug)
      );
    `);
    legacy.close();
    const db = openDatabase(path);
    try {
      const columns = db
        .prepare("PRAGMA table_info(interactive_projections)")
        .all() as Array<{ name: string; notnull: number }>;
      expect(columns.find((column) => column.name === "revision_id")?.notnull).toBe(
        0,
      );
      expect(columns.some((column) => column.name === "snapshot_id")).toBe(true);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("publishes only the approved bundle and revokes future access", async () => {
    const publish = vi.fn(async (_projection: RelayProjection) => undefined);
    const revoke = vi.fn(async (_slug: string) => undefined);
    const relay: ProjectionRelay = { publish, revoke };
    const db = openDatabase(":memory:");
    const app = createApp(db, { relay });
    try {
      await app.request("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "Sory Kaba" }),
      });
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [{ company: "Acme", title: "Lead", isCurrent: true }],
        }),
      });
      const workMap = (await (
        await app.request("/api/work-map")
      ).json()) as { roles: Array<{ id: string }> };
      await app.request(
        `/api/work-map/roles/${workMap.roles[0].id}/locations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: "Plant",
            address: "123 Private Street",
            latitude: 39.95,
            longitude: -75.16,
            isPublic: true,
          }),
        },
      );
      await app.request("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "sory-systems",
          visibility: "stealth",
          sections: ["profile", "history", "map", "skills"],
          hideCurrentEmployer: true,
          showExactLocations: false,
        }),
      });
      const created = await app.request("/api/work-map/publish", {
        method: "POST",
      });
      expect(created.status).toBe(201);
      const projection = (await created.json()) as {
        projection: { id: string; slug: string };
      };
      expect(publish).toHaveBeenCalledOnce();
      expect(publish.mock.calls[0][0]).not.toHaveProperty("occupantId");
      expect(publish.mock.calls[0][0]).not.toHaveProperty("revisionId");
      expect(publish.mock.calls[0][0].roles[0]).toMatchObject({
        organization: "Current employer",
        locations: [{ address: "" }],
      });

      expect(
        (await app.request("/api/public/sory-systems")).status,
      ).toBe(200);
      await app.request(
        `/api/projections/${projection.projection.id}/revoke`,
        { method: "POST" },
      );
      expect(revoke).toHaveBeenCalledWith("sory-systems");
      expect(
        (await app.request("/api/public/sory-systems")).status,
      ).toBe(404);
    } finally {
      db.close();
    }
  });
});
