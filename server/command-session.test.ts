import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("command session HTTP seam", () => {
  it("keeps multiple Home conversations and continues one after listing", async () => {
    const complete = vi.fn(async ({ messages }) => ({
      text:
        String(messages[1]?.content).includes("Conversation:")
          ? "Keep capturing measured outcomes."
          : "Your Worklog is still thin on measured outcomes.",
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

      const firstOpened = await app.request("/api/command/sessions", {
        method: "POST",
      });
      expect(firstOpened.status).toBe(201);
      const first = (await firstOpened.json()) as {
        session: { id: string; title: string };
      };

      const firstTurn = await app.request(
        `/api/command/sessions/${first.session.id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body: "What should I capture next?",
            grant: { remoteModel: false },
          }),
        },
      );
      expect(firstTurn.status).toBe(201);
      const firstThread = (await firstTurn.json()) as {
        session: { title: string };
        messages: Array<{ speaker: string; body: string }>;
      };
      expect(firstThread.session.title).toBe("What should I capture next?");
      expect(firstThread.messages).toEqual([
        expect.objectContaining({
          speaker: "occupant",
          body: "What should I capture next?",
        }),
        expect.objectContaining({
          speaker: "proforna",
          body: "Your Worklog is still thin on measured outcomes.",
        }),
      ]);

      const secondOpened = await app.request("/api/command/sessions", {
        method: "POST",
      });
      const second = (await secondOpened.json()) as {
        session: { id: string };
      };
      await app.request(`/api/command/sessions/${second.session.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: "Who is in My Network?",
          grant: { remoteModel: false },
        }),
      });

      const listed = (await (
        await app.request("/api/command/sessions")
      ).json()) as {
        sessions: Array<{ id: string; title: string }>;
      };
      expect(listed.sessions.map((session) => session.title)).toEqual([
        "Who is in My Network?",
        "What should I capture next?",
      ]);

      const continued = await app.request(
        `/api/command/sessions/${first.session.id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body: "Be more specific.",
            grant: { remoteModel: false },
          }),
        },
      );
      expect(continued.status).toBe(201);
      const follow = (await continued.json()) as {
        messages: Array<{ speaker: string; body: string }>;
      };
      expect(follow.messages).toHaveLength(4);
      expect(follow.messages[3]).toMatchObject({
        speaker: "proforna",
        body: "Keep capturing measured outcomes.",
      });
      expect(complete.mock.calls.at(-1)?.[0].messages[1].content).toContain(
        "[occupant] What should I capture next?",
      );

      const notices = (await (await app.request("/api/notices")).json()) as {
        notices: unknown[];
      };
      expect(notices.notices).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("renames and removes a conversation, and sends attached roles with the question", async () => {
    const complete = vi.fn(async (_input: { messages: Array<{ content: string }> }) => ({
      text: "That role is on the map.",
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
      const opened = await app.request("/api/command/sessions", { method: "POST" });
      const created = (await opened.json()) as { session: { id: string } };
      const renamed = await app.request(`/api/command/sessions/${created.session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Interviews" }),
      });
      expect(renamed.status).toBe(200);
      expect(((await renamed.json()) as { session: { title: string } }).session.title).toBe(
        "Interviews",
      );

      const turn = await app.request(`/api/command/sessions/${created.session.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: "What should I capture next?",
          roles: [
            {
              organization: "Giants Direct",
              title: "Technician",
              startDate: "2024-06",
              endDate: "",
              isCurrent: true,
            },
          ],
          grant: { remoteModel: false },
        }),
      });
      expect(turn.status).toBe(201);
      const thread = (await turn.json()) as {
        session: { title: string };
        messages: Array<{ body: string }>;
      };
      expect(thread.session.title).toBe("Interviews");
      expect(thread.messages[0]?.body).toBe("What should I capture next?");
      expect(complete.mock.calls.at(-1)?.[0].messages[1].content).toContain(
        "Roles in this question:\n- Giants Direct, Technician, 2024-06 – present",
      );

      const removed = await app.request(`/api/command/sessions/${created.session.id}`, {
        method: "DELETE",
      });
      expect(removed.status).toBe(204);
      const listed = (await (await app.request("/api/command/sessions")).json()) as {
        sessions: unknown[];
      };
      expect(listed.sessions).toEqual([]);
      const missing = await app.request(`/api/command/sessions/${created.session.id}`);
      expect(missing.status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("rejects a bad rename body, ignores an empty question, and keeps a rename made during a turn", async () => {
    let sessionId = "";
    let app: ReturnType<typeof createApp>;
    const complete = vi.fn(async (_input: { messages: Array<{ content: string }> }) => {
      const renamed = await app.request(`/api/command/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Interviews" }),
      });
      expect(renamed.status).toBe(200);
      return { text: "Noted.", model: "local-test" };
    });
    const db = openDatabase(":memory:");
    app = createApp(db, { complete });
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
      const opened = await app.request("/api/command/sessions", { method: "POST" });
      sessionId = ((await opened.json()) as { session: { id: string } }).session.id;

      const missing = await app.request(`/api/command/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      expect(missing.status).toBe(400);
      const emptyTitle = await app.request(`/api/command/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "null",
      });
      expect(emptyTitle.status).toBe(400);
      expect(((await emptyTitle.json()) as { error: string }).error).toBe("invalid-body");

      const empty = await app.request(`/api/command/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "  ", roles: [{}], grant: { remoteModel: false } }),
      });
      expect(empty.status).toBe(400);
      expect(((await empty.json()) as { error: string }).error).toBe("body-required");
      expect(complete).not.toHaveBeenCalled();

      const turn = await app.request(`/api/command/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: "What should I capture next?",
          grant: { remoteModel: false },
        }),
      });
      expect(turn.status).toBe(201);
      expect(((await turn.json()) as { session: { title: string } }).session.title).toBe(
        "Interviews",
      );
    } finally {
      db.close();
    }
  });
});
