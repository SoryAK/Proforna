import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("GET /api/sites/frame", () => {
  it("reads the frame rule for a public page and refuses this machine", async () => {
    const db = openDatabase(":memory:");
    try {
      let seen = "";
      const app = createApp(db, {
        frameHeaders: async (url) => {
          seen = url;
          return { frameOptions: "SAMEORIGIN", contentSecurityPolicy: null };
        },
      });
      const allowed = await app.request(
        `/api/sites/frame?url=${encodeURIComponent("https://example.com/about")}`,
      );
      expect(allowed.status).toBe(200);
      await expect(allowed.json()).resolves.toEqual({ frameable: false });
      expect(seen).toBe("https://example.com/about");

      const local = await app.request(
        `/api/sites/frame?url=${encodeURIComponent("http://127.0.0.1/secret")}`,
      );
      expect(local.status).toBe(400);
      expect(seen).toBe("https://example.com/about");
    } finally {
      db.close();
    }
  });
});

describe("GET /api/health", () => {
  it("reports the product and a live SQLite file", async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        product: "Proforna",
        db: "ok",
      });
    } finally {
      db.close();
    }
  });
});
