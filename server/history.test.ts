import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

function setup() {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  return {
    db,
    app,
    close() {
      db.close();
    },
  };
}

function setupUploads() {
  const db = openDatabase(":memory:");
  const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-uploads-"));
  const app = createApp(db, { uploadsDir });
  return {
    db,
    app,
    close() {
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    },
  };
}

describe("GET /api/history", () => {
  it("returns an empty career file for a new occupant", async () => {
    const ctx = setup();
    try {
      const res = await ctx.app.request("/api/history");
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        jobs: [],
        schools: [],
        skills: [],
      });
    } finally {
      ctx.close();
    }
  });

  it("reads back jobs, schools, and skills after extract save", async () => {
    const ctx = setup();
    try {
      const saved = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Acme",
              title: "Lead",
              location: "NYC",
              startDate: "2024-01-01",
              isCurrent: true,
              description: "Ran the shop.",
              achievements: ["Cut overtime"],
            },
          ],
          education: [
            {
              institution: "City College",
              degree: "AAS",
              field: "Electrical",
              startDate: "2016-01-01",
              endDate: "2018-05-01",
            },
          ],
          skills: ["TypeScript", "Conduit"],
        }),
      });
      expect(saved.status).toBe(201);

      const res = await ctx.app.request("/api/history");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        jobs: Array<{ title: string; company: string; isCurrent: boolean }>;
        schools: Array<{ institution: string; degree: string }>;
        skills: string[];
      };
      expect(body.jobs[0]).toMatchObject({
        title: "Lead",
        company: "Acme",
        isCurrent: true,
      });
      expect(body.schools[0]).toMatchObject({
        institution: "City College",
        degree: "AAS",
      });
      expect(body.skills).toEqual(["TypeScript", "Conduit"]);
    } finally {
      ctx.close();
    }
  });

  it("pins a validated job site onto the Work Map", async () => {
    const ctx = setup();
    try {
      await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Acme",
              title: "Lead",
              location: "Dayton, OH",
              site: {
                label: "Main plant",
                address: "Dayton, Ohio, United States",
                latitude: 39.7589,
                longitude: -84.1916,
              },
            },
          ],
          education: [],
          skills: [],
        }),
      });
      const map = await ctx.app.request("/api/work-map");
      const body = (await map.json()) as {
        roles: Array<{
          locations: Array<{ label: string; latitude: number }>;
        }>;
      };
      expect(body.roles[0]?.locations[0]).toMatchObject({
        label: "Main plant",
        latitude: 39.7589,
      });
    } finally {
      ctx.close();
    }
  });

  it("rejects an unknown resume id", async () => {
    const ctx = setup();
    try {
      const res = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: "missing-resume",
          experience: [{ company: "Acme", title: "Lead" }],
          education: [],
          skills: [],
        }),
      });
      expect(res.status).toBe(400);
    } finally {
      ctx.close();
    }
  });

  it("links extract facts to resume evidence and skips import backfill", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append(
        "file",
        new File(["%PDF-1.4 resume"], "cv.pdf", { type: "application/pdf" }),
      );
      const uploaded = await ctx.app.request("/api/resumes", {
        method: "POST",
        body: form,
      });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };

      const saved = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: stored.resume.id,
          experience: [
            {
              company: "Acme",
              title: "Lead",
              achievements: ["Cut overtime"],
            },
          ],
          education: [{ institution: "City College", degree: "AAS" }],
          skills: ["TypeScript"],
        }),
      });
      expect(saved.status).toBe(201);

      const memory = await ctx.app.request("/api/memory");
      const body = (await memory.json()) as {
        evidence: Array<{
          id: string;
          sourceType: string;
          sourceRef: string;
        }>;
        facts: Array<{
          factType: string;
          evidenceIds: string[];
          value: Record<string, unknown>;
        }>;
      };
      const resumeEvidence = body.evidence.find(
        (item) => item.sourceType === "resume",
      );
      expect(resumeEvidence?.sourceRef).toBe(stored.resume.id);
      expect(
        body.evidence.some(
          (item) =>
            item.sourceType === "import" &&
            item.sourceRef.startsWith("legacy-history:"),
        ),
      ).toBe(false);

      const role = body.facts.find((fact) => fact.factType === "role");
      const school = body.facts.find((fact) => fact.factType === "education");
      const achievement = body.facts.find(
        (fact) => fact.factType === "achievement",
      );
      const skill = body.facts.find((fact) => fact.factType === "skill");
      expect(role).toMatchObject({
        evidenceIds: [resumeEvidence?.id],
        value: { title: "Lead", company: "Acme" },
      });
      expect(school).toMatchObject({
        evidenceIds: [resumeEvidence?.id],
        value: { organization: "City College" },
      });
      expect(achievement).toMatchObject({
        evidenceIds: [resumeEvidence?.id],
        value: { statement: "Cut overtime" },
      });
      expect(skill).toMatchObject({
        evidenceIds: [resumeEvidence?.id],
        value: { name: "TypeScript" },
      });
    } finally {
      ctx.close();
    }
  });
});
