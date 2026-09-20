import { describe, expect, it } from "vitest";
import {
  buildInteractiveProjection,
  canViewProjection,
  planProjectionGrant,
  planProjectionRevoke,
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

  it("plans revoke and grant operations without a viewing token", () => {
    expect(
      planProjectionRevoke({ projectionId: "proj-1", slug: "systems" }),
    ).toEqual({
      action: "revoke",
      entityType: "interactive-projection",
      entityId: "proj-1",
      values: { slug: "systems" },
    });
    expect(
      planProjectionGrant({
        projectionId: "proj-1",
        slug: "systems",
        expiresAt: "2026-12-01T00:00:00.000Z",
        tokenHash: "abc123",
      }),
    ).toEqual({
      action: "create",
      entityType: "projection-access-grant",
      entityId: "proj-1",
      values: {
        slug: "systems",
        expiresAt: "2026-12-01T00:00:00.000Z",
        tokenHash: "abc123",
      },
    });
  });
});
