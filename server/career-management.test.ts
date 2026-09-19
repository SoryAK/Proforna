import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

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
});
