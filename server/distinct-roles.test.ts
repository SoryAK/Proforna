import { describe, expect, it } from "vitest";
import { prepareDistinctPair } from "../core/distinct-roles";
import { createApp } from "./app";
import { openDatabase } from "./db";

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function twoRoles() {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  await app.request(
    "/api/history",
    json("POST", {
      experience: [
        { company: "Acme", title: "Tech", isCurrent: true },
        { company: "Acme Corp", title: "Technician" },
      ],
    }),
  );
  const roles = ((await (await app.request("/api/work-map")).json()) as { roles: Array<{ id: string }> }).roles;
  return { db, app, a: roles[0].id, b: roles[1].id };
}

const pairs = async (app: ReturnType<typeof createApp>) =>
  ((await (await app.request("/api/work-map/distinct-pairs")).json()) as { pairs: Array<{ key: string }> }).pairs;

describe("not-a-duplicate marks are saved with the career", () => {
  it("reads a pair the same way in either order", () => {
    expect(prepareDistinctPair({ firstId: "b", secondId: "a" })).toEqual({
      ok: true,
      value: { firstId: "a", secondId: "b", key: "a|b" },
    });
    expect(prepareDistinctPair({ firstId: "a", secondId: "a" })).toEqual({ ok: false, error: "pair-invalid" });
    expect(prepareDistinctPair({ firstId: "a|x", secondId: "b" })).toEqual({ ok: false, error: "pair-invalid" });
  });

  it("marks, lists, and takes back a pair", async () => {
    const { db, app, a, b } = await twoRoles();
    try {
      expect((await app.request("/api/work-map/distinct-pairs", json("POST", { firstId: b, secondId: a }))).status).toBe(201);
      // Marking again is harmless.
      expect((await app.request("/api/work-map/distinct-pairs", json("POST", { firstId: a, secondId: b }))).status).toBe(201);
      expect((await pairs(app)).map((pair) => pair.key)).toEqual([[a, b].sort().join("|")]);
      expect((await app.request(`/api/work-map/distinct-pairs/${b}/${a}`, { method: "DELETE" })).status).toBe(200);
      expect(await pairs(app)).toEqual([]);
      expect((await app.request("/api/work-map/distinct-pairs", json("POST", { firstId: a, secondId: "nope" }))).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("drops a pair when one of its roles is removed", async () => {
    const { db, app, a, b } = await twoRoles();
    try {
      await app.request("/api/work-map/distinct-pairs", json("POST", { firstId: a, secondId: b }));
      expect((await app.request(`/api/work-map/roles/${a}`, { method: "DELETE" })).status).toBe(200);
      expect(await pairs(app)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("travels in a backup", async () => {
    const { db, app, a, b } = await twoRoles();
    const target = openDatabase(":memory:");
    try {
      await app.request("/api/work-map/distinct-pairs", json("POST", { firstId: a, secondId: b }));
      const archive = await (await app.request("/api/portability/export")).arrayBuffer();
      const form = new FormData();
      form.set("archive", new File([archive], "backup.zip", { type: "application/zip" }));
      const restoredApp = createApp(target);
      expect((await restoredApp.request("/api/portability/restore", { method: "POST", body: form })).status).toBe(200);
      expect((await pairs(restoredApp)).map((pair) => pair.key)).toEqual([[a, b].sort().join("|")]);
    } finally {
      db.close();
      target.close();
    }
  });
});
