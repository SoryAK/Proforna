import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("contact conversation HTTP seam", () => {
  it("keeps inbound messages on the Contact and sends without a leftover Notice", async () => {
    const perform = vi.fn(async () => ({ externalId: "sent-1" }));
    const db = openDatabase(":memory:");
    const app = createApp(db, { externalActions: { perform } });
    try {
      await app.request("/api/me");
      const first = await app.request("/api/contacts/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Alex Rivera",
          email: "alex@example.com",
          body: "May we talk Thursday?",
        }),
      });
      expect(first.status).toBe(201);
      const inbound = (await first.json()) as {
        contact: { id: string };
        message: { evidenceId: string; direction: string };
      };
      expect(inbound.message.direction).toBe("inbound");
      expect(inbound.message.evidenceId).toBeTruthy();

      const afterFirst = (await (await app.request("/api/notices")).json()) as {
        notices: Array<{ id: string; kind: string; href: string }>;
      };
      expect(afterFirst.notices).toEqual([
        expect.objectContaining({
          id: `contact:${inbound.contact.id}`,
          kind: "inbound-message",
          href: "network",
          title: "Alex Rivera sent a message",
        }),
      ]);

      const second = await app.request("/api/contacts/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Alex Rivera",
          email: "alex@example.com",
          body: "I can also do Friday.",
        }),
      });
      expect(second.status).toBe(201);
      const afterSecond = (await (
        await app.request("/api/notices")
      ).json()) as { notices: unknown[] };
      expect(afterSecond.notices).toHaveLength(1);

      const sent = await app.request(
        `/api/contacts/${inbound.contact.id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: "Thursday works." }),
        },
      );
      expect(sent.status).toBe(201);
      expect(perform).toHaveBeenCalledOnce();
      const outbound = (await sent.json()) as {
        action: { status: string };
        message: { direction: string };
      };
      expect(outbound.action.status).toBe("completed");
      expect(outbound.message.direction).toBe("outbound");

      const proposed = (await (await app.request("/api/notices")).json()) as {
        notices: Array<{ kind: string }>;
      };
      expect(proposed.notices.some((notice) => notice.kind === "proposed-change")).toBe(
        false,
      );

      const thread = await app.request(
        `/api/contacts/${inbound.contact.id}/messages`,
      );
      expect(thread.status).toBe(200);
      const body = (await thread.json()) as {
        messages: Array<{ direction: string; body: string }>;
      };
      expect(body.messages).toHaveLength(3);
      const remaining = (await (await app.request("/api/notices")).json()) as {
        notices: unknown[];
      };
      expect(remaining.notices).toEqual([]);

      const memory = (await (await app.request("/api/memory")).json()) as {
        evidence: Array<{ sourceType: string }>;
      };
      expect(
        memory.evidence.filter((item) => item.sourceType === "message"),
      ).toHaveLength(3);
    } finally {
      db.close();
    }
  });

  it("proposes a Proforna reply that sends only after approval", async () => {
    const perform = vi.fn(async () => ({ externalId: "sent-2" }));
    const complete = vi.fn(async () => ({
      text: JSON.stringify({ body: "Thursday works." }),
      model: "local-test",
    }));
    const db = openDatabase(":memory:");
    const app = createApp(db, { complete, externalActions: { perform } });
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
      const inbound = (await (
        await app.request("/api/contacts/inbound", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Alex Rivera",
            email: "alex@example.com",
            body: "May we talk Thursday?",
          }),
        })
      ).json()) as { contact: { id: string } };

      const ran = await app.request("/api/agency/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "suggest-reply",
          scope: { type: "contact", id: inbound.contact.id },
          grant: { remoteModel: false },
        }),
      });
      expect(ran.status).toBe(201);
      const body = (await ran.json()) as {
        run: { changeSet: { id: string; purpose: string; destination: string } };
      };
      expect(body.run.changeSet).toMatchObject({
        purpose: "Reply to Alex Rivera",
        destination: "alex@example.com",
      });
      expect(perform).not.toHaveBeenCalled();

      const notices = (await (await app.request("/api/notices")).json()) as {
        notices: Array<{ href: string; title: string; kind: string }>;
      };
      expect(notices.notices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "proposed-change",
            href: "network",
            title: "Reply to Alex Rivera",
          }),
        ]),
      );

      const approved = await app.request(
        `/api/contacts/${inbound.contact.id}/replies/${body.run.changeSet.id}/approve`,
        { method: "POST" },
      );
      expect(approved.status).toBe(200);
      expect(perform).toHaveBeenCalledOnce();

      const thread = (await (
        await app.request(`/api/contacts/${inbound.contact.id}/messages`)
      ).json()) as {
        messages: Array<{ direction: string; body: string }>;
        proposedReplies: unknown[];
      };
      expect(thread.messages.some((message) => message.body === "Thursday works.")).toBe(
        true,
      );
      expect(thread.proposedReplies).toEqual([]);
      const remaining = (await (await app.request("/api/notices")).json()) as {
        notices: Array<{ kind: string }>;
      };
      expect(
        remaining.notices.some((notice) => notice.kind === "proposed-change"),
      ).toBe(false);
    } finally {
      db.close();
    }
  });
});
