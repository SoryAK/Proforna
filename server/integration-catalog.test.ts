import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { readIntegrationSecrets } from "./integration-catalog";

describe("integration catalog", () => {
  it("saves, reads, changes, and removes a connection without returning secrets", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    const listed = await app.request("/api/integration-catalog");
    const body = (await listed.json()) as {
      integrations: Array<{ name: string; configured: boolean; available: boolean }>;
    };
    const names = body.integrations.map((item) => item.name);
    expect(names).not.toContain("zoom");
    expect(names).not.toContain("linkedin");
    expect(names).not.toContain("secret");
    expect(names).not.toContain("google-drive");

    const saved = await app.request("/api/integration-catalog/zoom", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { CLIENT_ID: "zoom-id", CLIENT_SECRET: "zoom-secret" } }),
    });
    expect(saved.status).toBe(200);
    const after = await app.request("/api/integration-catalog");
    const afterBody = await after.text();
    expect(afterBody).not.toContain("zoom-secret");
    expect(afterBody).not.toContain('"name":"zoom"');
    const occupant = db.prepare("SELECT id FROM occupants").get() as { id: string };
    expect(readIntegrationSecrets(db, occupant.id, "zoom")).toEqual({
      CLIENT_ID: "zoom-id",
      CLIENT_SECRET: "zoom-secret",
    });

    const changed = await app.request("/api/integration-catalog/zoom", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { CLIENT_ID: "next-id", CLIENT_SECRET: "next-secret" } }),
    });
    expect(changed.status).toBe(200);
    expect(readIntegrationSecrets(db, occupant.id, "zoom")?.CLIENT_SECRET).toBe("next-secret");

    const off = await app.request("/api/integration-catalog/zoom", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(await off.json()).toEqual({ enabled: false });
    expect(readIntegrationSecrets(db, occupant.id, "zoom")).toBeNull();
    const listedOff = await app.request("/api/integration-catalog");
    const offBody = (await listedOff.json()) as {
      integrations: Array<{ name: string }>;
    };
    expect(offBody.integrations.find((item) => item.name === "zoom")).toBeUndefined();
    const on = await app.request("/api/integration-catalog/zoom", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(await on.json()).toEqual({ enabled: true });
    expect(readIntegrationSecrets(db, occupant.id, "zoom")?.CLIENT_SECRET).toBe("next-secret");

    const removed = await app.request("/api/integration-catalog/zoom", { method: "DELETE" });
    expect(await removed.json()).toEqual({ configured: false });
    expect(readIntegrationSecrets(db, occupant.id, "zoom")).toBeNull();
  });

  it("refuses a gateway this app does not call", async () => {
    const app = createApp(openDatabase(":memory:"));
    const response = await app.request("/api/integration-catalog/google-drive", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: {} }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "integration-unavailable" });
  });
});
