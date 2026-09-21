import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { captureAccessRequest } from "./projections";

describe("career management HTTP seam", () => {
  it("tracks the opportunity loop and executes approved actions once", async () => {
    const perform = vi.fn(async () => ({ externalId: "message-1" }));
    const db = openDatabase(":memory:");
    const app = createApp(db, { externalActions: { perform } });
    try {
      const opportunityResponse = await app.request("/api/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "role",
          title: "Principal Systems Engineer",
          organization: "Northstar",
          fitSummary: "Strong reliability and migration match.",
        }),
      });
      const opportunity = (await opportunityResponse.json()) as {
        opportunity: { id: string };
      };
      const applicationResponse = await app.request(
        `/api/opportunities/${opportunity.opportunity.id}/applications`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nextStep: "Tailor resume" }),
        },
      );
      const application = (await applicationResponse.json()) as {
        application: { id: string };
      };
      expect(
        (
          await app.request(
            `/api/applications/${application.application.id}/transition`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ stage: "accepted" }),
            },
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await app.request(
            `/api/applications/${application.application.id}/transition`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ stage: "submitted" }),
            },
          )
        ).status,
      ).toBe(200);

      const proposed = await app.request("/api/external-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "message",
          destination: "recruiter@example.com",
          payload: { subject: "Following up", body: "Thank you." },
          idempotencyKey: "follow-up:application-1",
        }),
      });
      const action = (await proposed.json()) as { action: { id: string } };
      await app.request(`/api/external-actions/${action.action.id}/approve`, {
        method: "POST",
      });
      await app.request(`/api/external-actions/${action.action.id}/approve`, {
        method: "POST",
      });
      expect(perform).toHaveBeenCalledOnce();

      const dashboard = (await (
        await app.request("/api/career-management")
      ).json()) as {
        opportunities: unknown[];
        applications: Array<{ stage: string }>;
        actions: Array<{ status: string }>;
      };
      expect(dashboard.opportunities).toHaveLength(1);
      expect(dashboard.applications[0].stage).toBe("submitted");
      expect(dashboard.actions[0].status).toBe("completed");
    } finally {
      db.close();
    }
  });

  it("promotes a connection into My Network without touching a role Opportunity", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      await app.request("/api/me");
      const roleResponse = await app.request("/api/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "role",
          title: "Principal Systems Engineer",
          organization: "Northstar",
          fitSummary: "Strong reliability match.",
        }),
      });
      const role = (await roleResponse.json()) as {
        opportunity: { id: string; status: string };
      };
      db.prepare(
        `INSERT INTO interactive_projections
          (id, occupant_id, slug, visibility, projection_json, status, created_at)
         VALUES (?, 'local', ?, 'public', '{}', 'published', ?)`,
      ).run("proj-1", "sory-systems", "2026-09-21T12:00:00.000Z");
      captureAccessRequest(db, "sory-systems", {
        name: "Alex Rivera",
        email: "alex@example.com",
        message: "May I review the published map?",
      });

      const inbound = await app.request("/api/contacts/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Alex Rivera",
          email: "alex@example.com",
          body: "Can we talk Thursday?",
        }),
      });
      const thread = (await inbound.json()) as { contact: { id: string } };

      const dashboard = (await (
        await app.request("/api/career-management")
      ).json()) as {
        opportunities: Array<{
          id: string;
          kind: string;
          status: string;
          contact_id?: string | null;
        }>;
      };
      const connection = dashboard.opportunities.find(
        (item) => item.kind === "connection",
      );
      expect(connection).toBeTruthy();

      const refused = await app.request(
        `/api/opportunities/${role.opportunity.id}/network`,
        { method: "POST" },
      );
      expect(refused.status).toBe(400);

      const promoted = await app.request(
        `/api/opportunities/${connection?.id}/network`,
        { method: "POST" },
      );
      expect(promoted.status).toBe(200);
      const body = (await promoted.json()) as {
        opportunity: { status: string; contactId: string };
        contact: { id: string };
      };
      expect(body.opportunity.status).toBe("closed");
      expect(body.contact.id).toBe(thread.contact.id);

      const after = (await (
        await app.request("/api/career-management")
      ).json()) as {
        opportunities: Array<{ id: string; kind: string; status: string }>;
      };
      expect(
        after.opportunities.find((item) => item.id === role.opportunity.id)
          ?.status,
      ).toBe("saved");
      expect(
        after.opportunities.find((item) => item.id === connection?.id)?.status,
      ).toBe("closed");

      const messages = (await (
        await app.request(`/api/contacts/${thread.contact.id}/messages`)
      ).json()) as { messages: Array<{ body: string }> };
      expect(messages.messages).toEqual([
        expect.objectContaining({ body: "Can we talk Thursday?" }),
      ]);
    } finally {
      db.close();
    }
  });
});
