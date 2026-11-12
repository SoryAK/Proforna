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

describe("POST /api/history retry", () => {
  it("keeps a single copy when the same resume is saved again", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 same"], "cv.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };
      const payload = {
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
        education: [],
        skills: ["TypeScript"],
        resumeId: stored.resume.id,
      };
      const first = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(first.status).toBe(201);
      const second = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(second.status).toBe(201);
      const again = (await second.json()) as { jobs: number; skills: number };
      expect(again.jobs).toBe(1);
      expect(again.skills).toBe(1);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { jobs: unknown[]; skills: string[] };
      expect(career.jobs).toHaveLength(1);
      expect(career.skills).toEqual(["TypeScript"]);
    } finally {
      ctx.close();
    }
  });

  it("inserts a role the resume has not imported yet", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 more"], "cv.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };
      const lead = {
        company: "Acme",
        title: "Lead",
        location: "NYC",
        startDate: "2024-01-01",
        isCurrent: true,
        description: "Ran the shop.",
        achievements: ["Cut overtime"],
      };
      const first = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [lead],
          education: [],
          skills: ["TypeScript"],
          resumeId: stored.resume.id,
        }),
      });
      expect(first.status).toBe(201);
      const second = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            lead,
            {
              company: "Northwind",
              title: "Engineer",
              location: "Boston",
              startDate: "2020-01-01",
              endDate: "2023-12-01",
              isCurrent: false,
              description: "Built the line.",
              achievements: [],
            },
          ],
          education: [],
          skills: ["TypeScript", "Go"],
          resumeId: stored.resume.id,
        }),
      });
      expect(second.status).toBe(201);
      const added = (await second.json()) as { jobs: number; skills: number };
      expect(added.jobs).toBe(2);
      expect(added.skills).toBe(2);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { jobs: Array<{ title: string }>; skills: string[] };
      expect(career.jobs.map((job) => job.title).sort()).toEqual(["Engineer", "Lead"]);
      expect(career.skills).toEqual(["TypeScript", "Go"]);
    } finally {
      ctx.close();
    }
  });

  it("keeps one job when that job's evidence is the second resume", async () => {
    const ctx = setupUploads();
    try {
      const upload = async (name: string) => {
        const form = new FormData();
        form.append("file", new File([`%PDF-1.4 ${name}`], name, { type: "application/pdf" }));
        const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
        expect(uploaded.status).toBe(201);
        return ((await uploaded.json()) as { resume: { id: string } }).resume.id;
      };
      const first = await upload("first.pdf");
      const second = await upload("second.pdf");
      const payload = {
        experience: [
          {
            company: "Northwind",
            title: "Engineer",
            location: "Boston",
            startDate: "2020-01-01",
            endDate: "2023-12-01",
            isCurrent: false,
            description: "Built the line.",
            achievements: [],
          },
        ],
        education: [],
        skills: [],
        resumeId: first,
        evidence: {
          experience: [{ resumeIds: [second], achievements: [] }],
          education: [],
          skills: [],
        },
      };
      const saved = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(saved.status).toBe(201);
      const replay = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(replay.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { jobs: unknown[] };
      expect(career.jobs).toHaveLength(1);
    } finally {
      ctx.close();
    }
  });

  it("does not insert a second job after the career fact is gone", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 marker"], "cv.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };
      const payload = {
        experience: [
          {
            company: "Acme",
            title: "Lead",
            location: "NYC",
            startDate: "2024-01-01",
            isCurrent: true,
            description: "Ran the shop.",
            achievements: [],
          },
        ],
        education: [],
        skills: [],
        resumeId: stored.resume.id,
      };
      const first = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(first.status).toBe(201);
      ctx.db.exec("DELETE FROM career_facts");
      const second = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(second.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { jobs: unknown[] };
      expect(career.jobs).toHaveLength(1);
    } finally {
      ctx.close();
    }
  });

  it("keeps the original role when its title was edited before a replay", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 edited"], "cv.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };
      const payload = {
        experience: [
          {
            company: "Acme",
            title: "Lead",
            location: "NYC",
            startDate: "2024-01-01",
            isCurrent: true,
            description: "Ran the shop.",
            achievements: [],
          },
        ],
        education: [],
        skills: [],
        resumeId: stored.resume.id,
      };
      const first = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(first.status).toBe(201);
      ctx.db.prepare("UPDATE work_history SET title = ?").run("Director");
      const facts = ctx.db
        .prepare("SELECT id, value_json AS valueJson FROM career_facts WHERE fact_type = 'role' AND status = 'canonical'")
        .all() as Array<{ id: string; valueJson: string }>;
      for (const fact of facts) {
        const value = JSON.parse(fact.valueJson) as { title?: string };
        value.title = "Director";
        ctx.db.prepare("UPDATE career_facts SET value_json = ? WHERE id = ?").run(JSON.stringify(value), fact.id);
      }
      const replay = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(replay.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { jobs: Array<{ title: string }> };
      expect(career.jobs.map((job) => job.title)).toEqual(["Director"]);
    } finally {
      ctx.close();
    }
  });

  it("inserts a role when a career fact has no history row", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 fact"], "cv.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };
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
              achievements: [],
            },
          ],
          education: [],
          skills: [],
          resumeId: stored.resume.id,
        }),
      });
      expect(saved.status).toBe(201);
      const sample = ctx.db
        .prepare(
          `SELECT occupant_id AS occupantId, evidence_ids_json AS evidenceIdsJson, sensitivity
           FROM career_facts WHERE fact_type = 'role' LIMIT 1`,
        )
        .get() as { occupantId: string; evidenceIdsJson: string; sensitivity: string };
      ctx.db.prepare(
        `INSERT INTO career_facts
          (id, occupant_id, fact_type, subject_id, value_json, evidence_ids_json,
           sensitivity, version, status, supersedes_id, created_at)
         VALUES (?, ?, 'role', ?, ?, ?, ?, 1, 'canonical', NULL, ?)`,
      ).run(
        "fact-without-row",
        sample.occupantId,
        "missing-history-row",
        JSON.stringify({
          title: "Engineer",
          company: "Northwind",
          organization: "Northwind",
          location: "Boston",
          startDate: "2020-01-01",
          endDate: "2023-12-01",
          isCurrent: false,
          description: "Built the line.",
        }),
        sample.evidenceIdsJson,
        sample.sensitivity,
        new Date().toISOString(),
      );
      const added = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Northwind",
              title: "Engineer",
              location: "Boston",
              startDate: "2020-01-01",
              endDate: "2023-12-01",
              isCurrent: false,
              description: "Built the line.",
              achievements: [],
            },
          ],
          education: [],
          skills: [],
          resumeId: stored.resume.id,
        }),
      });
      expect(added.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as { jobs: Array<{ title: string }> };
      expect(career.jobs.map((job) => job.title).sort()).toEqual(["Engineer", "Lead"]);
    } finally {
      ctx.close();
    }
  });

  it("updates the saved role when a retry changes its title, organization, or dates", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 retry-title"], "cv.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };
      const first = await ctx.app.request("/api/history", {
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
          education: [],
          skills: [],
          roleIds: ["file-0-job-0"],
          resumeId: stored.resume.id,
        }),
      });
      expect(first.status).toBe(201);
      const revised = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Northwind",
              title: "Director",
              location: "Boston",
              startDate: "2022-03-01",
              endDate: "2024-11-01",
              isCurrent: false,
              description: "Ran the shop.",
              achievements: ["Cut overtime"],
            },
          ],
          education: [],
          skills: [],
          roleIds: ["file-0-job-0"],
          resumeId: stored.resume.id,
        }),
      });
      expect(revised.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as {
        jobs: Array<{ title: string; company: string; startDate: string; endDate: string }>;
      };
      expect(career.jobs).toEqual([
        expect.objectContaining({
          title: "Director",
          company: "Northwind",
          startDate: "2022-03-01",
          endDate: "2024-11-01",
        }),
      ]);
    } finally {
      ctx.close();
    }
  });

  it("saves an edited description and achievements on the role from the first save", async () => {
    const ctx = setupUploads();
    try {
      const form = new FormData();
      form.append("file", new File(["%PDF-1.4 retry-copy"], "cv.pdf", { type: "application/pdf" }));
      const uploaded = await ctx.app.request("/api/resumes", { method: "POST", body: form });
      expect(uploaded.status).toBe(201);
      const stored = (await uploaded.json()) as { resume: { id: string } };
      const role = {
        company: "Acme",
        title: "Lead",
        location: "NYC",
        startDate: "2024-01-01",
        isCurrent: true,
      };
      const first = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [{ ...role, description: "Ran the shop.", achievements: ["Cut overtime"] }],
          education: [],
          skills: [],
          roleIds: ["file-0-job-0"],
          resumeId: stored.resume.id,
        }),
      });
      expect(first.status).toBe(201);
      const revised = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            { ...role, description: "Led the floor.", achievements: ["Cut overtime", "Hired the crew"] },
          ],
          education: [],
          skills: [],
          roleIds: ["file-0-job-0"],
          resumeId: stored.resume.id,
        }),
      });
      expect(revised.status).toBe(201);
      const history = await ctx.app.request("/api/history");
      const career = (await history.json()) as {
        jobs: Array<{ title: string; description: string; achievements: string[] }>;
      };
      expect(career.jobs).toHaveLength(1);
      expect(career.jobs[0]).toMatchObject({
        title: "Lead",
        description: "Led the floor.",
        achievements: ["Cut overtime", "Hired the crew"],
      });
    } finally {
      ctx.close();
    }
  });
});
