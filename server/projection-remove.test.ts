import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { resolvePublishedProjection, type ProjectionRelay } from "./projections";

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function accessControlledPage() {
  const relay = {
    publish: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    grant: vi.fn(async () => undefined),
    revokeGrant: vi.fn(async () => undefined),
    erase: vi.fn(async () => undefined),
  } satisfies ProjectionRelay;
  const db = openDatabase(":memory:");
  const app = createApp(db, { relay });
  await app.request("/api/history", json("POST", { experience: [{ company: "Acme", title: "Lead", isCurrent: true }] }));
  await app.request(
    "/api/work-map/settings",
    json("PUT", { slug: "sory-systems", visibility: "access-controlled", sections: ["profile", "history"] }),
  );
  const published = (await (await app.request("/api/work-map/publish", { method: "POST" })).json()) as {
    projection: { id: string };
  };
  return { db, app, relay, projectionId: published.projection.id };
}

describe("access links can be listed and taken back one at a time", () => {
  it("shows who each link is for and revokes only the chosen one", async () => {
    const { db, app, relay, projectionId } = await accessControlledPage();
    try {
      // A recruiter asks, and the owner grants from Opportunities.
      await app.request("/api/public/sory-systems/requests", json("POST", { name: "Dana Reed", email: "dana@example.com" }));
      const opportunity = db.prepare("SELECT id FROM opportunities").get() as { id: string };
      const granted = (await (
        await app.request(`/api/opportunities/${opportunity.id}/access`, json("POST", { decision: "grant", expiresAt: "2099-01-01T00:00:00.000Z" }))
      ).json()) as { grant: { token: string } };
      // A second, direct link.
      const shared = (await (
        await app.request(`/api/projections/${projectionId}/grants`, json("POST", { expiresAt: "2099-01-01T00:00:00.000Z" }))
      ).json()) as { grant: { token: string } };

      const listed = (await (await app.request(`/api/projections/${projectionId}/grants`)).json()) as {
        grants: Array<{ id: string; requester: { name: string; email: string } | null; revokedAt: string | null }>;
      };
      expect(listed.grants).toHaveLength(2);
      expect(JSON.stringify(listed)).not.toContain(granted.grant.token);
      const dana = listed.grants.find((grant) => grant.requester?.name === "Dana Reed");
      expect(dana?.requester).toEqual({ name: "Dana Reed", email: "dana@example.com" });
      expect(listed.grants.some((grant) => grant.requester === null)).toBe(true);

      const revoked = await app.request(`/api/projections/${projectionId}/grants/${dana!.id}/revoke`, { method: "POST" });
      expect(revoked.status).toBe(200);
      expect(relay.revokeGrant).toHaveBeenCalledWith("sory-systems", hash(granted.grant.token));

      // Checked at the source, so the test holds however the token travels.
      const opens = (token: string) => resolvePublishedProjection(db, "sory-systems", token) !== null;
      expect(opens(granted.grant.token)).toBe(false);
      expect(opens(shared.grant.token)).toBe(true);
      expect((await app.request(`/api/projections/${projectionId}/grants/nope/revoke`, { method: "POST" })).status).toBe(404);
    } finally {
      db.close();
    }
  });
});

describe("a published page can be removed", () => {
  it("erases it here and on the relay, keeping the opportunity and the audit trail", async () => {
    const { db, app, relay, projectionId } = await accessControlledPage();
    try {
      await app.request("/api/public/sory-systems/requests", json("POST", { name: "Dana Reed", email: "dana@example.com" }));
      await app.request(`/api/projections/${projectionId}/grants`, json("POST", { expiresAt: "2099-01-01T00:00:00.000Z" }));
      await app.request("/api/public/sory-systems/events", json("POST", { eventType: "view" }));

      const removed = await app.request(`/api/projections/${projectionId}`, { method: "DELETE" });
      expect(removed.status).toBe(200);
      expect(relay.erase).toHaveBeenCalledWith("sory-systems");

      const projections = (await (await app.request("/api/projections")).json()) as { projections: unknown[] };
      expect(projections.projections).toEqual([]);
      for (const table of ["interactive_projections", "publications", "projection_access_grants", "projection_access_requests", "projection_events"]) {
        expect((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, table).toBe(0);
      }
      expect((db.prepare("SELECT COUNT(*) AS n FROM opportunities").get() as { n: number }).n).toBe(1);
      const audit = db.prepare("SELECT event_type FROM audit_events WHERE event_type = 'projection-removed'").all();
      expect(audit).toHaveLength(1);
      expect((await app.request(`/api/projections/${projectionId}`, { method: "DELETE" })).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("deletes nothing here when the relay cannot be reached", async () => {
    const { db, app, relay, projectionId } = await accessControlledPage();
    try {
      const { RelayTransportError } = await import("./relay-client");
      relay.erase.mockRejectedValueOnce(new RelayTransportError(503, "down"));
      expect((await app.request(`/api/projections/${projectionId}`, { method: "DELETE" })).status).toBe(502);
      expect((db.prepare("SELECT COUNT(*) AS n FROM interactive_projections").get() as { n: number }).n).toBe(1);
    } finally {
      db.close();
    }
  });
});
