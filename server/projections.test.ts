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

  it("keeps the public slug and frozen snapshot until the occupant publishes again", async () => {
    const publish = vi.fn(async (_projection: RelayProjection) => undefined);
    const relay: ProjectionRelay = {
      publish,
      revoke: vi.fn(async () => undefined),
    };
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
      await app.request("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "sory-systems",
          visibility: "public",
          sections: ["profile", "history"],
        }),
      });
      expect((await app.request("/api/work-map/publish", { method: "POST" })).status).toBe(
        201,
      );

      const workMap = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ id: string }>;
      };
      await app.request(`/api/work-map/roles/${workMap.roles[0].id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Principal" }),
      });

      const frozen = (await (
        await app.request("/api/public/sory-systems")
      ).json()) as { projection: { roles: Array<{ title: string }>; slug: string } };
      expect(frozen.projection.slug).toBe("sory-systems");
      expect(frozen.projection.roles[0].title).toBe("Lead");

      const republished = await app.request("/api/work-map/publish", {
        method: "POST",
      });
      expect(republished.status).toBe(201);
      const body = (await republished.json()) as {
        projection: { slug: string };
        publication: { slug: string };
      };
      expect(body.projection.slug).toBe("sory-systems");
      expect(body.publication.slug).toBe("sory-systems");
      expect(publish).toHaveBeenCalledTimes(2);
      expect(publish.mock.calls[1][0].slug).toBe("sory-systems");
      expect(publish.mock.calls[1][0].roles[0]).toMatchObject({
        title: "Principal",
      });

      const updated = (await (
        await app.request("/api/public/sory-systems")
      ).json()) as { projection: { roles: Array<{ title: string }> } };
      expect(updated.projection.roles[0].title).toBe("Principal");
    } finally {
      db.close();
    }
  });

  it("records occupant-approved change sets for settings, grants, and revoke", async () => {
    const grant = vi.fn(
      async (_slug: string, _grant: { token: string; expiresAt: string }) =>
        undefined,
    );
    const relay: ProjectionRelay = {
      publish: vi.fn(async () => undefined),
      revoke: vi.fn(async () => undefined),
      grant,
    };
    const db = openDatabase(":memory:");
    const app = createApp(db, { relay });
    try {
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [{ company: "Acme", title: "Lead", isCurrent: true }],
        }),
      });
      const settingsBody = {
        slug: "sory-systems",
        visibility: "access-controlled",
        sections: ["profile", "history"],
      };
      expect(
        (
          await app.request("/api/work-map/settings", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(settingsBody),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await app.request("/api/work-map/settings", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(settingsBody),
          })
        ).status,
      ).toBe(200);

      const published = await app.request("/api/work-map/publish", {
        method: "POST",
      });
      expect(published.status).toBe(201);
      const created = (await published.json()) as {
        projection: { id: string };
      };
      const granted = await app.request(
        `/api/projections/${created.projection.id}/grants`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expiresAt: "2026-12-01T00:00:00.000Z" }),
        },
      );
      expect(granted.status).toBe(201);
      const grantBody = (await granted.json()) as {
        grant: { token: string };
      };
      expect(grantBody.grant.token).toEqual(expect.any(String));
      expect(grant).toHaveBeenCalledWith("sory-systems", {
        token: grantBody.grant.token,
        expiresAt: "2026-12-01T00:00:00.000Z",
      });

      expect(
        (
          await app.request(
            `/api/projections/${created.projection.id}/revoke`,
            { method: "POST" },
          )
        ).status,
      ).toBe(200);

      const memory = (await (await app.request("/api/memory")).json()) as {
        audit: Array<{
          eventType: string;
          changeSetId: string | null;
          approvalId: string | null;
          detail: Record<string, unknown>;
        }>;
      };
      const settingsEvents = memory.audit.filter(
        (event) => event.eventType === "publication-settings-updated",
      );
      const grantEvents = memory.audit.filter(
        (event) => event.eventType === "projection-grant-created",
      );
      const revokeEvents = memory.audit.filter(
        (event) => event.eventType === "projection-revoked",
      );
      expect(settingsEvents).toHaveLength(1);
      expect(grantEvents).toHaveLength(1);
      expect(revokeEvents).toHaveLength(1);
      for (const event of [...settingsEvents, ...grantEvents, ...revokeEvents]) {
        expect(event.changeSetId).toEqual(expect.any(String));
        expect(event.approvalId).toEqual(expect.any(String));
      }
      expect(JSON.stringify(memory)).not.toContain(grantBody.grant.token);
    } finally {
      db.close();
    }
  });

  it("files a public Work Map access request as a connection opportunity", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      await app.request("/api/me");
      db.prepare(
        `INSERT INTO interactive_projections
          (id, occupant_id, slug, visibility, projection_json, status, created_at)
         VALUES (?, 'local', ?, 'public', '{}', 'published', ?)`,
      ).run("proj-1", "sory-systems", "2026-09-19T10:00:00.000Z");
      const created = await app.request("/api/public/sory-systems/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Alex Rivera",
          email: "alex@northstar.example",
          message: "May I review the published map?",
        }),
      });
      expect(created.status).toBe(201);
      const dashboard = (await (
        await app.request("/api/career-management")
      ).json()) as {
        opportunities: Array<{
          kind: string;
          title: string;
          organization: string;
          fit_summary: string;
        }>;
        contacts: Array<{ name: string; email: string; organization: string }>;
      };
      expect(dashboard.opportunities).toContainEqual(
        expect.objectContaining({
          kind: "connection",
          title: "Alex Rivera asked to view the Work Map",
          organization: "northstar.example",
          fit_summary: "May I review the published map?",
        }),
      );
      expect(dashboard.contacts).toContainEqual(
        expect.objectContaining({
          name: "Alex Rivera",
          email: "alex@northstar.example",
          organization: "northstar.example",
        }),
      );
    } finally {
      db.close();
    }
  });
});
