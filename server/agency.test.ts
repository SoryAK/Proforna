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
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonObject: false,
          keepAlive: 0,
          contextTokens: 8192,
        }),
      );

      const notices = (await (await app.request("/api/notices")).json()) as {
        notices: unknown[];
      };
      expect(notices.notices).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("extracts facts into one proposed Change Set", async () => {
    const complete = vi.fn(async () => ({
      text: JSON.stringify({
        achievements: [
          {
            statement: "Led the migration of 18 systems without service loss.",
            confidence: "supported",
          },
        ],
        skills: [
          {
            name: "Incident leadership",
            confidence: "candidate",
          },
        ],
      }),
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
          content: "Led the migration of 18 systems without service loss.",
        }),
      });
      const entry = (await capture.json()) as { entry: { id: string } };

      const ran = await app.request("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "extract-facts",
          scope: { type: "worklog", id: entry.entry.id },
          grant: { remoteModel: false },
        }),
      });
      expect(ran.status).toBe(201);
      expect(complete).toHaveBeenCalledOnce();
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonObject: true,
          keepAlive: 0,
          contextTokens: 8192,
        }),
      );
      const body = (await ran.json()) as {
        run: {
          purpose: string;
          status: string;
          answer: string | null;
          changeSet: { purpose: string; destination: string };
        };
      };
      expect(body.run).toMatchObject({
        purpose: "extract-facts",
        status: "completed",
        answer: null,
        changeSet: {
          purpose: "Promote facts from Atlas migration",
          destination: "worklog",
        },
      });

      const notices = (await (await app.request("/api/notices")).json()) as {
        notices: Array<{ href: string; title: string }>;
      };
      expect(notices.notices).toEqual([
        expect.objectContaining({
          href: "worklog",
          title: "Promote facts from Atlas migration",
        }),
      ]);
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

  it("refuses a second Agent Run while the model is still working", async () => {
    let release!: (value: { text: string; model: string }) => void;
    const complete = vi.fn(
      () =>
        new Promise<{ text: string; model: string }>((resolve) => {
          release = resolve;
        }),
    );
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
      const body = JSON.stringify({
        purpose: "inspect",
        scope: { type: "worklog", id: entry.entry.id },
        grant: { remoteModel: false },
      });
      const first = app.request("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
      const busy = await app.request("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(busy.status).toBe(409);
      await expect(busy.json()).resolves.toEqual({ error: "model-busy" });
      expect(complete).toHaveBeenCalledOnce();
      release({ text: "done", model: "local-test" });
      expect((await first).status).toBe(201);
    } finally {
      db.close();
    }
  });

  it("answers a Home command without writing a Change Set", async () => {
    const complete = vi.fn(async () => ({
      text: "Your Worklog is still thin on measured outcomes.",
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
      const ran = await app.request("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "command",
          scope: { type: "home" },
          prompt: "What should I capture next?",
          grant: { remoteModel: false },
        }),
      });
      expect(ran.status).toBe(201);
      const body = (await ran.json()) as {
        run: { purpose: string; answer: string; changeSet: null };
      };
      expect(body.run).toMatchObject({
        purpose: "command",
        answer: "Your Worklog is still thin on measured outcomes.",
        changeSet: null,
      });
      const notices = (await (await app.request("/api/notices")).json()) as {
        notices: unknown[];
      };
      expect(notices.notices).toEqual([]);
    } finally {
      db.close();
    }
  });
});
