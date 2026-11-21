import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { ProjectionRelay } from "./projections";

/** A relay whose calls are recorded, and whose grant can be held back to land late. */
function slowRelay() {
  const calls: string[] = [];
  let releaseGrant: () => void = () => undefined;
  const relay: ProjectionRelay = {
    async publish(projection) {
      calls.push(`publish ${projection.slug}`);
    },
    async revoke(slug) {
      calls.push(`revoke ${slug}`);
    },
    async grant(slug) {
      calls.push(`grant ${slug} start`);
      await new Promise<void>((resolve) => {
        releaseGrant = resolve;
      });
      calls.push(`grant ${slug} done`);
    },
    async revokeGrant(slug) {
      calls.push(`revokeGrant ${slug}`);
    },
    async erase(slug) {
      calls.push(`erase ${slug}`);
    },
  };
  return { relay, calls, release: () => releaseGrant() };
}

async function publishedPage(relay?: ProjectionRelay) {
  const db = openDatabase(":memory:");
  const app = createApp(db, relay ? { relay } : {});
  const json = (method: string, body?: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  await app.request("/api/history", json("POST", { experience: [{ company: "Acme", title: "Tech", isCurrent: true }] }));
  await app.request("/api/work-map/settings", json("PUT", { slug: "sory", visibility: "access-controlled", sections: ["profile", "history"] }));
  expect((await app.request("/api/work-map/publish", json("POST"))).status).toBe(201);
  const projectionId = (db.prepare("SELECT id FROM interactive_projections").get() as { id: string }).id;
  return { db, app, json, projectionId };
}

describe("changes to one page", () => {
  it("run one at a time, so a revoke waits for a link still being handed out", async () => {
    const slow = slowRelay();
    const { db, app, json, projectionId } = await publishedPage(slow.relay);
    try {
      const granting = app.request(`/api/projections/${projectionId}/grants`, json("POST", { expiresAt: "2099-01-01T00:00:00.000Z" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      const removing = app.request(`/api/projections/${projectionId}`, json("DELETE"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      // The erase hasn't started: it waits for the grant to finish on the relay.
      expect(slow.calls).not.toContain("erase sory");
      slow.release();
      expect((await granting).status).toBe(201);
      expect((await removing).status).toBe(200);
      expect(slow.calls.slice(-2)).toEqual(["grant sory done", "erase sory"]);
    } finally {
      db.close();
    }
  });
});

describe("without a relay", () => {
  it("won't remove a page or revoke a link that lives on the relay", async () => {
    const db = openDatabase(":memory:");
    const relay: ProjectionRelay = {
      publish: async () => undefined,
      revoke: async () => undefined,
      grant: async () => undefined,
      revokeGrant: async () => undefined,
      erase: async () => undefined,
    };
    // Publish and hand out a link with a relay, then run without one.
    const first = await publishedPageOn(db, relay);
    const grant = await first.app.request(
      `/api/projections/${first.projectionId}/grants`,
      first.json("POST", { expiresAt: "2099-01-01T00:00:00.000Z" }),
    );
    expect(grant.status).toBe(201);
    const grantId = (db.prepare("SELECT id FROM projection_access_grants").get() as { id: string }).id;
    const offline = createApp(db);
    try {
      const revoked = await offline.request(`/api/projections/${first.projectionId}/grants/${grantId}/revoke`, { method: "POST" });
      expect(revoked.status).toBe(409);
      expect(((await revoked.json()) as { error: string }).error).toBe("relay-not-configured");
      expect((db.prepare("SELECT revoked_at FROM projection_access_grants").get() as { revoked_at: string | null }).revoked_at).toBeNull();

      const removed = await offline.request(`/api/projections/${first.projectionId}`, { method: "DELETE" });
      expect(removed.status).toBe(409);
      expect((db.prepare("SELECT COUNT(*) AS n FROM interactive_projections").get() as { n: number }).n).toBe(1);
    } finally {
      db.close();
    }
  });

  it("still removes a page that never went to a relay", async () => {
    const { db, app, projectionId } = await publishedPage();
    try {
      expect((await app.request(`/api/projections/${projectionId}`, { method: "DELETE" })).status).toBe(200);
      expect((db.prepare("SELECT COUNT(*) AS n FROM interactive_projections").get() as { n: number }).n).toBe(0);
    } finally {
      db.close();
    }
  });
});

async function publishedPageOn(db: ReturnType<typeof openDatabase>, relay: ProjectionRelay) {
  const app = createApp(db, { relay });
  const json = (method: string, body?: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  await app.request("/api/history", json("POST", { experience: [{ company: "Acme", title: "Tech", isCurrent: true }] }));
  await app.request("/api/work-map/settings", json("PUT", { slug: "sory", visibility: "access-controlled", sections: ["profile", "history"] }));
  expect((await app.request("/api/work-map/publish", json("POST"))).status).toBe(201);
  const projectionId = (db.prepare("SELECT id FROM interactive_projections").get() as { id: string }).id;
  return { app, json, projectionId };
}
