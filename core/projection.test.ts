import { describe, expect, it } from "vitest";
import {
  buildInteractiveProjection,
  canViewProjection,
} from "./projection";
import type { WorkMapSnapshot } from "./work-map";

const snapshot: WorkMapSnapshot = {
  id: "snapshot-1",
  occupantId: "local",
  slug: "systems",
  visibility: "public",
  targetRole: "Principal Systems Engineer",
  theme: "dark",
  profile: {
    displayName: "Sory Kaba",
    headline: "Systems leader",
    city: "Philadelphia",
    state: "PA",
    bio: "",
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
      locations: [],
      media: [],
      milestones: [],
      events: [],
      techStack: [],
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
  skills: [],
  sections: ["profile", "history", "map"],
  expiresAt: null,
  sourceFingerprint: "abc",
  createdAt: "2026-09-19T20:00:00.000Z",
};

describe("interactive projection", () => {
  it("uses the approved Work Map snapshot without consulting resume data", () => {
    const result = buildInteractiveProjection({
      snapshot,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: "snapshot-1",
      slug: "systems",
      roles: [{ organization: "Acme" }],
    });
  });

  it("requires a grant for access-controlled views", () => {
    const result = buildInteractiveProjection({
      snapshot: { ...snapshot, visibility: "access-controlled" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      canViewProjection(result.value, {
        now: "2026-09-19T20:02:00.000Z",
        hasAccessGrant: false,
      }),
    ).toBe(false);
  });
});
