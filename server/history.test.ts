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

  it("pins a validated school site onto the Work Map", async () => {
    const ctx = setup();
    try {
      await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [],
          education: [
            {
              institution: "City College",
              degree: "AAS",
              location: "Philadelphia, PA",
              site: {
                label: "City College",
                address: "Philadelphia, Pennsylvania, United States",
                latitude: 39.9526,
                longitude: -75.1652,
              },
            },
          ],
          skills: [],
        }),
      });
      const map = await ctx.app.request("/api/work-map");
      const body = (await map.json()) as {
        roles: Array<{
          kind: string;
          locations: Array<{ label: string; latitude: number }>;
        }>;
      };
      expect(body.roles[0]).toMatchObject({ kind: "school" });
      expect(body.roles[0]?.locations[0]).toMatchObject({
        label: "City College",
        latitude: 39.9526,
      });
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

  it("keeps a typed skill without tying it to a resume", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 typed"], "typed.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      const stored = (await uploaded.json()) as { resume: { id: string } };
      const saved = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: stored.resume.id,
          experience: [{ company: "Acme", title: "Lead", achievements: ["Kept duty"] }],
          education: [],
          skills: ["CAD"],
          evidence: {
            experience: [{ resumeIds: [stored.resume.id], achievements: [stored.resume.id] }],
            education: [],
            skills: [""],
          },
        }),
      });
      expect(saved.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { skills: string[] };
      expect(career.skills).toContain("CAD");
      const memory = await ctx.app.request("/api/memory");
      const body = (await memory.json()) as {
        facts: Array<{ factType: string; evidenceIds: string[]; value: Record<string, unknown> }>;
      };
      const skill = body.facts.find((fact) => fact.factType === "skill" && fact.value.name === "CAD");
      expect(skill).toBeUndefined();
    } finally {
      ctx.close();
    }
  });

  it("points a duty from a second resume at that resume", async () => {
    const ctx = setupUploads();
    try {
      async function upload(name: string, bytes: string) {
        const form = new FormData();
        form.append("file", new File([bytes], name, { type: "application/pdf" }));
        const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
        expect(uploaded.status).toBe(201);
        return ((await uploaded.json()) as { resume: { id: string } }).resume.id;
      }
      const first = await upload("first.pdf", "%PDF-1.4 first");
      const second = await upload("second.pdf", "%PDF-1.4 second");
      const saved = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: first,
          experience: [
            {
              company: "Acme",
              title: "Lead",
              achievements: ["Kept duty", "Added duty"],
            },
          ],
          education: [],
          skills: [],
          evidence: {
            experience: [
              {
                resumeIds: [first, second],
                achievements: [first, second],
              },
            ],
            education: [],
            skills: [],
          },
        }),
      });
      expect(saved.status).toBe(201);
      const memory = await ctx.app.request("/api/memory");
      const body = (await memory.json()) as {
        evidence: Array<{ id: string; sourceRef: string }>;
        facts: Array<{ factType: string; evidenceIds: string[]; value: Record<string, unknown> }>;
      };
      const firstEvidence = body.evidence.find((item) => item.sourceRef === first);
      const secondEvidence = body.evidence.find((item) => item.sourceRef === second);
      const role = body.facts.find((fact) => fact.factType === "role");
      const added = body.facts.find(
        (fact) => fact.factType === "achievement" && fact.value.statement === "Added duty",
      );
      expect(role?.evidenceIds).toEqual([firstEvidence?.id, secondEvidence?.id]);
      expect(added?.evidenceIds).toEqual([secondEvidence?.id]);
    } finally {
      ctx.close();
    }
  });

  it("updates a kept role from a later resume and remembers a set-aside", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 first"], "first.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      const first = ((await uploaded.json()) as { resume: { id: string } }).resume.id;
      const saved = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: first,
          experience: [{ company: "Acme", title: "Engineer", achievements: ["Kept duty"] }],
          education: [],
          skills: [],
        }),
      });
      expect(saved.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { jobs: Array<{ id: string }> };
      const secondForm = new FormData();
      secondForm.append("file", new File(["%PDF-1.4 second"], "second.pdf", { type: "application/pdf" }));
      const secondUpload = await ctx.app.request("/api/resumes", { method: "POST", body: secondForm });
      const second = ((await secondUpload.json()) as { resume: { id: string } }).resume.id;
      const applied = await ctx.app.request("/api/resumes/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: second,
          updates: [
            {
              id: career.jobs[0]?.id,
              kind: "job",
              title: "Engineer",
              organization: "Acme",
              location: "",
              startDate: "2018-01-01",
              endDate: "2020-01-01",
              isCurrent: false,
              description: "",
              achievements: ["Kept duty", "Added duty"],
            },
          ],
          created: { experience: [], education: [], skills: [] },
          asides: [{ kind: "job", title: "Analyst", organization: "Northwind", startDate: "2014-01-01", endDate: "2016-01-01" }],
        }),
      });
      expect(applied.status).toBe(201);
      const memory = await ctx.app.request("/api/memory");
      const body = (await memory.json()) as {
        evidence: Array<{ id: string; sourceRef: string }>;
        facts: Array<{ factType: string; evidenceIds: string[]; value: Record<string, unknown> }>;
      };
      const secondEvidence = body.evidence.find((item) => item.sourceRef === second);
      const added = body.facts.find(
        (fact) => fact.factType === "achievement" && fact.value.statement === "Added duty",
      );
      expect(added?.evidenceIds).toEqual([secondEvidence?.id]);
      const asides = await ctx.app.request("/api/resume-asides");
      const asideBody = (await asides.json()) as { asides: Array<{ title: string }> };
      expect(asideBody.asides.map((aside) => aside.title)).toEqual(["Analyst"]);
    } finally {
      ctx.close();
    }
  });
});
