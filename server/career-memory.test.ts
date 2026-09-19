import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("career memory HTTP seam", () => {
  it("captures evidence and commits only an explicitly approved fact", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      const evidenceResponse = await app.request("/api/memory/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: "worklog",
          sourceRef: "entry-1",
          title: "Recovery retrospective",
          content: { result: "Recovery fell from 42 to 11 minutes." },
        }),
      });
      expect(evidenceResponse.status).toBe(201);
      const evidence = (await evidenceResponse.json()) as {
        evidence: { id: string };
      };

      const proposalResponse = await app.request("/api/memory/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "Promote measured recovery result",
          factType: "achievement",
          subjectId: "role-1",
          value: { statement: "Cut recovery from 42 to 11 minutes." },
          evidenceIds: [evidence.evidence.id],
        }),
      });
      expect(proposalResponse.status).toBe(201);
      const proposal = (await proposalResponse.json()) as {
        changeSet: { id: string };
      };

      const before = (await (
        await app.request("/api/memory")
      ).json()) as { facts: Array<{ factType: string }> };
      expect(before.facts.some((fact) => fact.factType === "achievement")).toBe(
        false,
      );

      const approval = await app.request(
        `/api/memory/proposals/${proposal.changeSet.id}/approve`,
        { method: "POST" },
      );
      expect(approval.status).toBe(200);

      const after = (await (
        await app.request("/api/memory")
      ).json()) as {
        facts: Array<{ status: string; value: { statement: string } }>;
        audit: Array<{ eventType: string }>;
      };
      expect(after.facts).toContainEqual(
        expect.objectContaining({
          status: "canonical",
          value: { statement: "Cut recovery from 42 to 11 minutes." },
        }),
      );
      expect(after.audit[0].eventType).toBe("fact-created");
    } finally {
      db.close();
    }
  });
});
