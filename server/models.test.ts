import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_BASE_URL } from "../core/model-connection";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("model connection HTTP", () => {
  it("saves a local connection and never returns the key", async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      const created = await app.request("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hosting: "local",
          baseUrl: DEFAULT_LOCAL_BASE_URL,
          model: "llama3.2",
        }),
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as {
        connection: { hosting: string; hasKey: boolean; apiKey?: unknown };
      };
      expect(body.connection.hosting).toBe("local");
      expect(body.connection.hasKey).toBe(false);
      expect(body.connection.apiKey).toBeUndefined();

      const listed = await app.request("/api/models");
      const list = (await listed.json()) as {
        connections: Array<{ model: string; hasKey: boolean }>;
      };
      expect(list.connections).toHaveLength(1);
      expect(list.connections[0]?.model).toBe("llama3.2");
    } finally {
      db.close();
    }
  });

  it("refuses a cloud connection without a key", async () => {
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      const res = await app.request("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hosting: "cloud",
          baseUrl: "https://api.openai.com/v1",
        }),
      });
      expect(res.status).toBe(400);
    } finally {
      db.close();
    }
  });

  it("discovers models from an OpenAI-compatible /models list", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: "mistral" }, { id: "qwen2.5" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db);
      const res = await app.request("/api/models/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: DEFAULT_LOCAL_BASE_URL }),
      });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        models: ["mistral", "qwen2.5"],
      });
    } finally {
      globalThis.fetch = original;
      db.close();
    }
  });
});
