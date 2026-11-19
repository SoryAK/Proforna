import { describe, expect, it } from "vitest";
import {
  buildInteractiveProjection,
  canViewProjection,
  describeRelayChanges,
  planProjectionGrant,
  planProjectionRevoke,
  presentRelayStatus,
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
      place: "",
      description: "",
      achievements: ["Cut recovery from 42 to 11 minutes."],
      locations: [],
      media: [],
      linkedEvidence: [],
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

describe("presentRelayStatus", () => {
  const publishedAt = "2026-11-12T15:00:00.000Z";
  const live = { publishedAt, snapshot };

  it("keeps a private career off the relay", () => {
    expect(
      presentRelayStatus({ current: { ...snapshot, visibility: "private" }, live }),
    ).toEqual({ state: "private" });
  });

  it("reports a career that has no live publication", () => {
    expect(presentRelayStatus({ current: snapshot, live: null })).toEqual({
      state: "unpublished",
    });
  });

  it("reports the relay as current when the source matches what was published", () => {
    expect(
      presentRelayStatus({ current: { ...snapshot, id: "snapshot-2" }, live }),
    ).toEqual({ state: "current", publishedAt });
  });

  it("lists what moved on since the publish", () => {
    const current: WorkMapSnapshot = {
      ...snapshot,
      sourceFingerprint: "def",
      roles: [{ ...snapshot.roles[0], title: "Principal Systems Engineer" }],
      skills: ["Go", "Rust"],
    };
    expect(presentRelayStatus({ current, live })).toEqual({
      state: "changed",
      publishedAt,
      changes: ["Edited Acme", "Added 2 skills"],
    });
  });

  it("reports changes with no public difference when only private details moved", () => {
    expect(
      presentRelayStatus({ current: { ...snapshot, sourceFingerprint: "def" }, live }),
    ).toEqual({ state: "changed", publishedAt, changes: [] });
  });

  it("reports changes when the published snapshot is unknown", () => {
    expect(
      presentRelayStatus({ current: snapshot, live: { publishedAt, snapshot: null } }),
    ).toEqual({ state: "changed", publishedAt, changes: [] });
  });
});

describe("describeRelayChanges", () => {
  const role = snapshot.roles[0];

  it("names a few roles and counts many", () => {
    const added = ["Beta", "Gamma", "Delta"].map((organization, index) => ({
      ...role,
      id: `new-${index}`,
      organization,
    }));
    expect(
      describeRelayChanges(snapshot, {
        ...snapshot,
        roles: [...added, { ...role, id: "role-2", organization: "Zeta" }],
      }),
    ).toEqual(["Added 4 roles", "Removed Acme"]);
  });

  it("notes profile and publication setting changes", () => {
    expect(
      describeRelayChanges(snapshot, {
        ...snapshot,
        profile: { ...snapshot.profile, headline: "Platform leader" },
        sections: ["profile", "history"],
      }),
    ).toEqual(["Profile updated", "Publication settings changed"]);
  });
});
