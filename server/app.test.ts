import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

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
