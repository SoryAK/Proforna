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
});
