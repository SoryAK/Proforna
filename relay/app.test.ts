import { describe, expect, it } from "vitest";
import { createRelayApp } from "./app";
import { openRelayDatabase } from "./db";

const projection = {
  id: "projection-1",
  slug: "systems",
  visibility: "public",
  targetRole: "Principal Systems Engineer",
  theme: "dark",
  profile: {
    displayName: "Sory Kaba",
    headline: "Systems leader",
    city: "Philadelphia",
    state: "PA",
    bio: "Evidence-backed systems leader.",
    links: { linkedin: "", github: "", portfolio: "" },
  },
  roles: [
    {
      id: "role-1",
      kind: "job",
      title: "Lead Systems Engineer",
      organization: "Acme",
      span: "2024 — Present",
      description: "",
      achievements: ["Cut recovery from 42 to 11 minutes."],
      locations: [
        {
          id: "location-1",
          label: "Plant",
          address: "",
          latitude: 39.95,
          longitude: -75.16,
          kind: "primary",
          isPublic: true,
        },
      ],
      media: [],
      milestones: [],
      events: [],
      techStack: ["PLC"],
      skills: [],
      schedule: { shift: "", hoursPerWeek: null, workMode: "onsite" },
      benefits: [],
      paidTimeOff: "",
      environment: "",
      growth: "",
      departure: "",
      workplaceRating: null,
      equipment: [],
    },
  ],
  skills: ["Incident leadership"],
  sections: ["profile", "history", "map", "skills"],
  expiresAt: null,
  sourceFingerprint: "abc",
  createdAt: "2026-09-19T20:00:00.000Z",
};

describe("publishing relay", () => {
  it("publishes a minimized bundle and blocks access after revocation", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      const publish = await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ projection }),
      });
      expect(publish.status).toBe(201);

      const publicPage = await app.request("/r/systems?view=journey");
      expect(publicPage.status).toBe(200);
      expect(await publicPage.text()).toContain("Cut recovery");

      const revoke = await app.request("/relay/publications/systems", {
        method: "DELETE",
        headers: { authorization: "Bearer owner-secret" },
      });
      expect(revoke.status).toBe(200);
      expect((await app.request("/r/systems")).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("offers an access request instead of exposing a protected map", async () => {
    const db = openRelayDatabase(":memory:");
    const app = createRelayApp(db, "owner-secret");
    try {
      await app.request("/relay/publications/systems", {
        method: "PUT",
        headers: {
          authorization: "Bearer owner-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projection: { ...projection, visibility: "access-controlled" },
        }),
      });
      const page = await app.request("/r/systems");
      expect(page.status).toBe(403);
      expect(await page.text()).toContain("Request access");
      expect(
        (
          await app.request("/r/systems/requests", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "Recruiter",
              email: "recruiter@example.com",
            }),
          })
        ).status,
      ).toBe(201);
    } finally {
      db.close();
    }
  });
});
