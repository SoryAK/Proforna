import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("Agency HTTP seam", () => {
  it("inspects a Worklog entry locally and records the Agent Run", async () => {
    const complete = vi.fn(async () => ({
      text: "This capture is thin on evidence.",
      model: "local-test",
    }));
    const db = openDatabase(":memory:");
    const app = createApp(db, { complete });
    try {
      await app.request("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hosting: "local",
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "local-test",
        }),
      });
      const capture = await app.request("/api/worklog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          occurredOn: "2026-09-21",
          title: "Atlas migration",
          content: "Discussed next quarter priorities.",
        }),
      });
      const entry = (await capture.json()) as { entry: { id: string } };

      const ran = await app.request("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "inspect",
          scope: { type: "worklog", id: entry.entry.id },
          grant: { remoteModel: false },
        }),
      });
      expect(ran.status).toBe(201);
      const body = (await ran.json()) as {
        run: {
          purpose: string;
          status: string;
          answer: string;
          model: string;
        };
      };
      expect(body.run).toMatchObject({
        purpose: "inspect",
        status: "completed",
        answer: "This capture is thin on evidence.",
        model: "local-test",
      });
      expect(complete).toHaveBeenCalledOnce();

      const notices = (await (await app.request("/api/notices")).json()) as {
        notices: unknown[];
      };
      expect(notices.notices).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("refuses a cloud model without a remote-model grant", async () => {
    const complete = vi.fn(async () => ({ text: "nope", model: "gpt" }));
    const db = openDatabase(":memory:");
    const app = createApp(db, { complete });
    try {
      await app.request("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hosting: "cloud",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4.1",
          apiKey: "sk-test",
        }),
      });
      const capture = await app.request("/api/worklog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          occurredOn: "2026-09-21",
          title: "Atlas migration",
          content: "Discussed next quarter priorities.",
        }),
      });
      const entry = (await capture.json()) as { entry: { id: string } };
      const refused = await app.request("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "inspect",
          scope: { type: "worklog", id: entry.entry.id },
          grant: { remoteModel: false },
        }),
      });
      expect(refused.status).toBe(403);
      await expect(refused.json()).resolves.toEqual({
        error: "remote-model-grant-required",
      });
      expect(complete).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
});
