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
});
