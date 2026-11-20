import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRelayApp } from "./app";
import { openRelayDatabase } from "./db";

const owner = { authorization: "Bearer owner-secret", "content-type": "application/json" };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function relayWithPage() {
  const db = openRelayDatabase(":memory:");
  const app = createRelayApp(db, "owner-secret");
  await app.request("/relay/publications/systems", {
    method: "PUT",
    headers: owner,
    body: JSON.stringify({
      projection: { id: "p1", slug: "systems", visibility: "access-controlled", profile: {}, roles: [] },
    }),
  });
  for (const token of ["dana-token", "lee-token"]) {
    await app.request("/relay/publications/systems/grants", {
      method: "POST",
      headers: owner,
      body: JSON.stringify({ token, expiresAt: "2099-01-01T00:00:00.000Z" }),
    });
  }
  return { db, app };
}

const count = (db: ReturnType<typeof openRelayDatabase>, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("the owner manages a page on the relay", () => {
  it("revokes one access link by its hash and leaves the others", async () => {
    const { db, app } = await relayWithPage();
    try {
      const response = await app.request(`/relay/publications/systems/grants/${hash("dana-token")}`, {
        method: "DELETE",
        headers: owner,
      });
      expect(response.status).toBe(200);
      const rows = db.prepare("SELECT token_hash, revoked_at FROM relay_grants").all() as Array<{
        token_hash: string;
        revoked_at: string | null;
      }>;
      expect(rows.find((row) => row.token_hash === hash("dana-token"))?.revoked_at).not.toBeNull();
      expect(rows.find((row) => row.token_hash === hash("lee-token"))?.revoked_at).toBeNull();
    } finally {
      db.close();
    }
  });

  it("erases the page and everything held for it", async () => {
    const { db, app } = await relayWithPage();
    try {
      await app.request("/r/systems/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Dana", email: "dana@example.com" }),
      });
      expect((await app.request("/relay/publications/systems/erase", { method: "POST", headers: owner })).status).toBe(200);
      for (const table of ["relay_publications", "relay_grants", "relay_requests", "relay_events"]) {
        expect(count(db, table), table).toBe(0);
      }
      expect((await app.request("/r/systems")).status).toBe(404);
      // Erasing again is not an error.
      expect((await app.request("/relay/publications/systems/erase", { method: "POST", headers: owner })).status).toBe(200);
    } finally {
      db.close();
    }
  });

  it("refuses both without the owner token", async () => {
    const { db, app } = await relayWithPage();
    try {
      expect((await app.request(`/relay/publications/systems/grants/${hash("dana-token")}`, { method: "DELETE" })).status).toBe(401);
      expect((await app.request("/relay/publications/systems/erase", { method: "POST" })).status).toBe(401);
      expect(count(db, "relay_publications")).toBe(1);
    } finally {
      db.close();
    }
  });
});
