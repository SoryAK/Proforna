import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { captureAccessRequest } from "./projections";

describe("GET /api/notices", () => {
  it("starts empty, then includes proposed changes and access requests", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      const empty = await app.request("/api/notices");
      expect(empty.status).toBe(200);
      await expect(empty.json()).resolves.toEqual({ notices: [] });

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

      db.prepare(
        `INSERT INTO interactive_projections
          (id, occupant_id, slug, visibility, projection_json, status, created_at)
         VALUES (?, 'local', ?, 'public', '{}', 'published', ?)`,
      ).run("proj-1", "sory-systems", "2026-09-19T10:00:00.000Z");
      captureAccessRequest(db, "sory-systems", {
        name: "Alex Rivera",
        email: "alex@example.com",
        message: "May I review the published map?",
      });

      const pending = await app.request("/api/notices");
      expect(pending.status).toBe(200);
      const body = (await pending.json()) as {
        notices: Array<{
          id: string;
          kind: string;
          title: string;
          href: string;
        }>;
      };
      expect(body.notices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: proposal.changeSet.id,
            kind: "proposed-change",
            title: "Promote measured recovery result",
            href: "worklog",
          }),
          expect.objectContaining({
            kind: "access-request",
            title: "Alex Rivera asked to view the Work Map",
            href: "opportunities",
          }),
        ]),
      );
      expect(body.notices).toHaveLength(2);

      const approval = await app.request(
        `/api/memory/proposals/${proposal.changeSet.id}/approve`,
        { method: "POST" },
      );
      expect(approval.status).toBe(200);
      const remaining = (await (
        await app.request("/api/notices")
      ).json()) as { notices: Array<{ kind: string }> };
      expect(remaining.notices).toEqual([
        expect.objectContaining({ kind: "access-request" }),
      ]);
    } finally {
      db.close();
    }
  });
});
