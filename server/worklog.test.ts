import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("worklog HTTP seam", () => {
  it("captures work and batch-approves extracted facts", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      const capture = await app.request("/api/worklog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          occurredOn: "2026-09-19",
          title: "Atlas migration",
          content:
            "Led the migration of 18 systems without service loss. Coordinated the support rota.",
          roleId: "role-1",
          tags: ["skill:Incident leadership"],
        }),
      });
      expect(capture.status).toBe(201);
      const entry = (await capture.json()) as { entry: { id: string } };

      const proposed = await app.request(
        `/api/worklog/${entry.entry.id}/proposals`,
        { method: "POST" },
      );
      expect(proposed.status).toBe(201);
      const proposals = (await proposed.json()) as {
        changeSets: Array<{ id: string }>;
      };
      expect(proposals.changeSets).toHaveLength(2);

      const approved = await app.request("/api/worklog/proposals/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          changeSetIds: proposals.changeSets.map((item) => item.id),
        }),
      });
      expect(approved.status).toBe(200);

      const memory = (await (
        await app.request("/api/memory")
      ).json()) as { facts: Array<{ factType: string }> };
      expect(memory.facts.some((fact) => fact.factType === "achievement")).toBe(
        true,
      );
      expect(memory.facts.some((fact) => fact.factType === "skill")).toBe(true);
    } finally {
      db.close();
    }
  });
});
