import { describe, expect, it } from "vitest";
import { prepareIntegration } from "../core/portability";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { loadLatestModelConnection } from "./models";

function setup() {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  const json = (method: string, body: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { db, app, json };
}

describe("opportunities can be changed", () => {
  it("changes the fields the screen edits and keeps the rest", async () => {
    const { db, app, json } = setup();
    try {
      const created = await app.request(
        "/api/opportunities",
        json("POST", {
          kind: "role",
          title: "Tech",
          organization: "Acme",
          fitSummary: "PLC work",
          sourceUrl: "https://jobs.example/1",
          location: "Lancaster, PA",
        }),
      );
      const { opportunity } = (await created.json()) as { opportunity: { id: string } };
      const changed = await app.request(
        `/api/opportunities/${opportunity.id}`,
        json("PUT", { title: "Senior Tech", organization: "Acme Corp", fitSummary: "Robotics" }),
      );
      expect(changed.status).toBe(200);
      const row = db
        .prepare("SELECT title, organization, fit_summary, source_url, location, kind FROM opportunities")
        .get();
      expect(row).toEqual({
        title: "Senior Tech",
        organization: "Acme Corp",
        fit_summary: "Robotics",
        source_url: "https://jobs.example/1",
        location: "Lancaster, PA",
        kind: "role",
      });
      expect(
        (await app.request(`/api/opportunities/${opportunity.id}`, json("PUT", { title: "" }))).status,
      ).toBe(400);
      expect((await app.request("/api/opportunities/nope", json("PUT", { title: "x" }))).status).toBe(404);
    } finally {
      db.close();
    }
  });
});

describe("model connections can be changed and removed", () => {
  it("keeps the saved key when the key field is left blank", async () => {
    const { db, app, json } = setup();
    try {
      const added = await app.request(
        "/api/models",
        json("POST", { hosting: "cloud", baseUrl: "https://api.example/v1", model: "a", apiKey: "sk-first" }),
      );
      const { connection } = (await added.json()) as { connection: { id: string } };
      const changed = await app.request(
        `/api/models/${connection.id}`,
        json("PUT", { hosting: "cloud", baseUrl: "https://api.example/v1", model: "b", apiKey: "" }),
      );
      expect(changed.status).toBe(200);
      const body = (await changed.json()) as { connection: { model: string; hasKey: boolean; apiKey?: string } };
      expect(body.connection).toMatchObject({ model: "b", hasKey: true });
      expect(JSON.stringify(body)).not.toContain("sk-first");
      const occupant = db.prepare("SELECT id FROM occupants").get() as { id: string };
      expect(loadLatestModelConnection(db, occupant.id)?.apiKey).toBe("sk-first");

      await app.request(
        `/api/models/${connection.id}`,
        json("PUT", { hosting: "cloud", baseUrl: "https://api.example/v1", model: "b", apiKey: "sk-second" }),
      );
      expect(loadLatestModelConnection(db, occupant.id)?.apiKey).toBe("sk-second");
      expect(
        (await app.request(`/api/models/${connection.id}`, json("PUT", { hosting: "cloud", baseUrl: "nope" }))).status,
      ).toBe(400);
    } finally {
      db.close();
    }
  });

  it("removes a connection", async () => {
    const { db, app, json } = setup();
    try {
      const added = await app.request(
        "/api/models",
        json("POST", { hosting: "local", baseUrl: "http://127.0.0.1:11434/v1", model: "llama" }),
      );
      const { connection } = (await added.json()) as { connection: { id: string } };
      expect((await app.request(`/api/models/${connection.id}`, { method: "DELETE" })).status).toBe(200);
      const list = (await (await app.request("/api/models")).json()) as { connections: unknown[] };
      expect(list.connections).toEqual([]);
      expect((await app.request(`/api/models/${connection.id}`, { method: "DELETE" })).status).toBe(404);
    } finally {
      db.close();
    }
  });
});

describe("integrations can be changed and removed", () => {
  it("shares one reading of the fields between add and change", () => {
    expect(prepareIntegration({ kind: "calendar", label: " Work ", config: { id: "primary" } })).toEqual({
      ok: true,
      value: { kind: "calendar", label: "Work", config: { id: "primary" } },
    });
    expect(prepareIntegration({ kind: "fax", label: "x" })).toEqual({ ok: false, error: "kind-invalid" });
    expect(prepareIntegration({ kind: "email", label: "" })).toEqual({ ok: false, error: "label-required" });
    expect(prepareIntegration({ kind: "email", label: "x", config: { apiKey: "k" } })).toEqual({
      ok: false,
      error: "secret-not-allowed",
    });
  });

  it("finds a secret however deep it sits, and keeps ordinary nested settings", async () => {
    const { db, app, json } = setup();
    try {
      const nested = { kind: "calendar", label: "Work", config: { auth: { accessToken: "x" } } };
      const inList = { kind: "calendar", label: "Work", config: { accounts: [{ refresh_token: "x" }] } };
      expect(prepareIntegration(nested)).toEqual({ ok: false, error: "secret-not-allowed" });
      expect(prepareIntegration(inList)).toEqual({ ok: false, error: "secret-not-allowed" });
      expect((await app.request("/api/integrations", json("POST", nested))).status).toBe(400);

      const added = await app.request(
        "/api/integrations",
        json("POST", { kind: "calendar", label: "Work", config: { calendar: { id: "primary" } } }),
      );
      expect(added.status).toBe(201);
      const { integration } = (await added.json()) as { integration: { id: string } };
      expect((await app.request(`/api/integrations/${integration.id}`, json("PUT", nested))).status).toBe(400);
      const stored = db.prepare("SELECT config_json FROM integration_connections WHERE id = ?").get(integration.id) as {
        config_json: string;
      };
      expect(JSON.parse(stored.config_json)).toEqual({ calendar: { id: "primary" } });
    } finally {
      db.close();
    }
  });

  it("changes and removes an integration, still refusing secrets", async () => {
    const { db, app, json } = setup();
    try {
      const added = await app.request(
        "/api/integrations",
        json("POST", { kind: "calendar", label: "Work", config: { calendarId: "primary" } }),
      );
      const { integration } = (await added.json()) as { integration: { id: string } };
      const changed = await app.request(
        `/api/integrations/${integration.id}`,
        json("PUT", { kind: "calendar", label: "Personal", config: { calendarId: "home" } }),
      );
      expect(changed.status).toBe(200);
      expect(
        (
          await app.request(
            `/api/integrations/${integration.id}`,
            json("PUT", { kind: "calendar", label: "x", config: { accessToken: "t" } }),
          )
        ).status,
      ).toBe(400);
      const list = (await (await app.request("/api/integrations")).json()) as {
        integrations: Array<{ label: string; config: unknown }>;
      };
      expect(list.integrations).toMatchObject([{ label: "Personal", config: { calendarId: "home" } }]);
      expect((await app.request(`/api/integrations/${integration.id}`, { method: "DELETE" })).status).toBe(200);
      expect(((await (await app.request("/api/integrations")).json()) as { integrations: unknown[] }).integrations).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe("the profile photo can be removed", () => {
  it("goes back to no photo and deletes the file", async () => {
    const { mkdtempSync, readdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-avatar-"));
    const db = openDatabase(":memory:");
    const app = createApp(db, { uploadsDir });
    try {
      const form = new FormData();
      form.set("avatar", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "me.png", { type: "image/png" }));
      expect((await app.request("/api/profile/avatar", { method: "POST", body: form })).status).toBe(201);
      expect(readdirSync(uploadsDir)).toHaveLength(1);

      const removed = await app.request("/api/profile/avatar", { method: "DELETE" });
      expect(removed.status).toBe(200);
      const body = (await removed.json()) as { profile: { avatarUrl: string | null } };
      expect(body.profile.avatarUrl).toBeNull();
      expect(readdirSync(uploadsDir)).toEqual([]);
      expect((await app.request("/api/profile/avatar")).status).toBe(404);
      const empty = new FormData();
      empty.set("avatar", new File([], "empty.png", { type: "image/png" }));
      expect((await app.request("/api/profile/avatar", { method: "POST", body: empty })).status).toBe(400);
      // Removing again is harmless.
      expect((await app.request("/api/profile/avatar", { method: "DELETE" })).status).toBe(200);

      // A file that can't be deleted keeps its name, so removing can be tried again.
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(uploadsDir, "avatar-stuck.png"));
      db.prepare("UPDATE profiles SET avatar_stored_name = 'avatar-stuck.png'").run();
      expect((await app.request("/api/profile/avatar", { method: "DELETE" })).status).toBe(500);
      expect((db.prepare("SELECT avatar_stored_name AS name FROM profiles").get() as { name: string }).name).toBe(
        "avatar-stuck.png",
      );
    } finally {
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    }
  });
});
