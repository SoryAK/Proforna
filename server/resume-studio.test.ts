import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("Resume Studio HTTP seam", () => {
  it("pins revisions and exports real PDF and DOCX artifacts", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      await app.request("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "Sory Kaba" }),
      });
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Acme",
              title: "Lead Systems Engineer",
              startDate: "2024",
              isCurrent: true,
            },
          ],
        }),
      });

      const variantResponse = await app.request("/api/resume-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Principal systems",
          targetRole: "Principal Systems Engineer",
          intent: "Lead with reliability",
        }),
      });
      expect(variantResponse.status).toBe(201);
      const variant = (await variantResponse.json()) as {
        variant: { id: string };
      };
      const revisionResponse = await app.request(
        `/api/resume-studio/${variant.variant.id}/revisions`,
        { method: "POST" },
      );
      expect(revisionResponse.status).toBe(201);
      const revision = (await revisionResponse.json()) as {
        revision: { id: string; pinnedFacts: unknown[] };
      };
      expect(revision.revision.pinnedFacts.length).toBeGreaterThan(0);

      const pdf = await app.request(
        `/api/resume-studio/revisions/${revision.revision.id}/export/pdf`,
      );
      expect(pdf.status).toBe(200);
      expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe(
        "%PDF",
      );

      const docx = await app.request(
        `/api/resume-studio/revisions/${revision.revision.id}/export/docx`,
      );
      expect(docx.status).toBe(200);
      expect(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString()).toBe(
        "PK",
      );
    } finally {
      db.close();
    }
  });
});
