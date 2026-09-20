import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("Work Map career-fact HTTP seam", () => {
  it("attaches subject-linked facts on read and writes them when a role is saved", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Acme",
              title: "Lead",
              isCurrent: true,
              achievements: ["Cut recovery from 42 to 11 minutes."],
            },
          ],
        }),
      });

      const workMap = (await (
        await app.request("/api/work-map")
      ).json()) as {
        roles: Array<{
          id: string;
          factId: string | null;
          claims: Array<{ text: string; factId: string }>;
        }>;
      };
      expect(workMap.roles[0].factId).toEqual(expect.any(String));
      expect(workMap.roles[0].claims).toEqual([
        expect.objectContaining({
          text: "Cut recovery from 42 to 11 minutes.",
        }),
      ]);

      const saved = await app.request(
        `/api/work-map/roles/${workMap.roles[0].id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Principal",
            achievements: [
              "Cut recovery from 42 to 11 minutes.",
              "Mentored the night shift.",
            ],
          }),
        },
      );
      expect(saved.status).toBe(200);
      const body = (await saved.json()) as {
        role: {
          factId: string;
          factVersion: number;
          claims: Array<{ text: string }>;
        };
      };
      expect(body.role.factVersion).toBe(2);
      expect(body.role.claims.map((claim) => claim.text)).toEqual([
        "Cut recovery from 42 to 11 minutes.",
        "Mentored the night shift.",
      ]);

      const memory = (await (await app.request("/api/memory")).json()) as {
        evidence: Array<{ id: string; sourceType: string }>;
        facts: Array<{
          factType: string;
          subjectId: string;
          status: string;
          evidenceIds: string[];
          value: Record<string, unknown>;
        }>;
      };
      expect(memory.evidence.some((item) => item.sourceType === "work-map")).toBe(
        true,
      );
      const workMapEvidenceIds = new Set(
        memory.evidence
          .filter((item) => item.sourceType === "work-map")
          .map((item) => item.id),
      );
      expect(
        memory.facts.some(
          (fact) =>
            fact.factType === "role" &&
            fact.subjectId === workMap.roles[0].id &&
            fact.status === "canonical" &&
            fact.value.title === "Principal",
        ),
      ).toBe(true);
      expect(
        memory.facts.some(
          (fact) =>
            fact.factType === "achievement" &&
            fact.subjectId === workMap.roles[0].id &&
            fact.status === "canonical" &&
            fact.value.statement === "Mentored the night shift." &&
            fact.evidenceIds.some((id) => workMapEvidenceIds.has(id)),
        ),
      ).toBe(true);

      await app.request("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "fact-link",
          visibility: "unlisted",
          sections: ["profile", "history"],
        }),
      });
      const published = await app.request("/api/work-map/publish", {
        method: "POST",
      });
      expect(published.status).toBe(201);
      const snapshot = (await published.json()) as {
        projection: { roles: Array<Record<string, unknown>> };
      };
      const publishedJson = JSON.stringify(snapshot.projection);
      expect(publishedJson).not.toContain("factId");
      expect(publishedJson).not.toContain("evidenceIds");
      expect(publishedJson).not.toContain(body.role.factId);
    } finally {
      db.close();
    }
  });
});
