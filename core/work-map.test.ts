import { describe, expect, it } from "vitest";
import type { CareerFactVersion } from "./career-memory";
import {
  EMPTY_WORK_MAP_DETAILS,
  attachFactsToWorkMapRole,
  buildWorkMapSnapshot,
  planWorkMapPublicationSettings,
  planWorkMapRoleFactSync,
  prepareWorkMapLocation,
  presentWorkMapPlace,
  publicationAllowsSnapshot,
  publicationNeedsAudienceConfirm,
  type WorkMapPublicationSettings,
  type WorkMapRole,
} from "./work-map";

describe("Work Map publication snapshots", () => {
  it("publishes approved map detail while keeping private evidence and pay out", () => {
    const role = sampleRole({
      factId: "secret-fact",
      factVersion: 3,
      evidenceIds: ["secret-evidence"],
      claims: [
        {
          text: "Reduced recovery time.",
          factId: "secret-claim",
          factVersion: 2,
          evidenceIds: ["secret-evidence"],
        },
      ],
    });
    const snapshot = buildWorkMapSnapshot({
      id: "snapshot-1",
      occupantId: "local",
      profile: {
        fullName: "Sory Kaba",
        headline: "Systems leader",
        city: "Philadelphia",
        state: "PA",
        bio: "Builds reliable systems.",
        linkedinUrl: "",
        githubUrl: "",
        portfolioUrl: "",
      },
      roles: [role],
      skills: ["Automation"],
      settings: {
        slug: "sory-map",
        targetRole: "Principal Engineer",
        theme: "dark",
        visibility: "stealth",
        sections: ["profile", "history", "map", "media"],
        hideCurrentEmployer: true,
        showExactLocations: false,
        expiresAt: null,
      },
      sourceFingerprint: "abc",
      createdAt: "2026-09-19T20:00:00.000Z",
    });

    expect(snapshot.profile.displayName).toBe("Verified career professional");
    expect(snapshot.roles[0].organization).toBe("Current employer");
    expect(snapshot.roles[0].locations[0]).toMatchObject({
      address: "",
      latitude: 40,
      longitude: -75.2,
    });
    expect(snapshot.roles[0].media).toHaveLength(1);
    expect(snapshot.roles[0]).not.toHaveProperty("schedule");
    expect(snapshot.roles[0]).not.toHaveProperty("benefits");
    expect(snapshot.roles[0]).not.toHaveProperty("paidTimeOff");
    expect(snapshot.roles[0]).not.toHaveProperty("environment");
    expect(snapshot.roles[0]).not.toHaveProperty("growth");
    expect(snapshot.roles[0]).not.toHaveProperty("departure");
    expect(snapshot.roles[0]).not.toHaveProperty("workplaceRating");
    expect(snapshot.roles[0]).not.toHaveProperty("equipment");
    const published = JSON.stringify(snapshot);
    expect(published).not.toContain("150000");
    expect(published).not.toContain("private.jpg");
    expect(published).not.toContain("secret-fact");
    expect(published).not.toContain("secret-evidence");
    expect(published).not.toContain("secret-claim");
    expect(published).not.toContain("SECRET_NIGHT_SHIFT");
    expect(published).not.toContain("SECRET_BENEFIT");
    expect(published).not.toContain("SECRET_PTO");
    expect(published).not.toContain("SECRET_ENV");
    expect(published).not.toContain("SECRET_GROWTH_NOTE");
    expect(published).not.toContain("SECRET_DEPARTURE");
    expect(published).not.toContain("SECRET_TOOL");
  });

  it("includes working conditions only when the occupant approves each field for publishing", () => {
    const snapshot = buildWorkMapSnapshot({
      id: "snapshot-2",
      occupantId: "local",
      profile: {
        fullName: "Sory Kaba",
        headline: "Systems leader",
        city: "Philadelphia",
        state: "PA",
        bio: "Builds reliable systems.",
        linkedinUrl: "",
        githubUrl: "",
        portfolioUrl: "",
      },
      roles: [
        sampleRole({
          details: {
            ...structuredClone(EMPTY_WORK_MAP_DETAILS),
            growth: "Grew into incident command.",
            departure: "Left after the plant closed.",
            paidTimeOff: "Four weeks.",
            environment: "Loud production floor.",
            uniform: "FR coveralls",
            workplaceRating: 4,
            benefits: ["Shift premium"],
            equipment: ["Fluke 87"],
            schedule: {
              shift: "Nights",
              hoursPerWeek: 40,
              workMode: "onsite",
            },
            compensation: {
              currency: "USD",
              period: "annual",
              amount: 150_000,
              visibility: "public",
            },
            share: {
              growth: true,
              departure: false,
              schedule: true,
              benefits: true,
              paidTimeOff: false,
              environment: false,
              workplaceRating: false,
              equipment: true,
              uniform: false,
            },
          },
        }),
      ],
      skills: [],
      settings: {
        slug: "sory-map",
        targetRole: "Principal Engineer",
        theme: "dark",
        visibility: "public",
        sections: ["profile", "history"],
        hideCurrentEmployer: false,
        showExactLocations: false,
        expiresAt: null,
      },
      sourceFingerprint: "abc",
      createdAt: "2026-09-19T20:00:00.000Z",
    });

    expect(snapshot.roles[0]).toMatchObject({
      growth: "Grew into incident command.",
      schedule: { shift: "Nights", hoursPerWeek: 40, workMode: "onsite" },
      benefits: ["Shift premium"],
      equipment: ["Fluke 87"],
      compensation: { currency: "USD", period: "annual", amount: 150_000 },
    });
    expect(snapshot.roles[0]).not.toHaveProperty("departure");
    expect(snapshot.roles[0]).not.toHaveProperty("paidTimeOff");
    expect(snapshot.roles[0]).not.toHaveProperty("environment");
    expect(snapshot.roles[0]).not.toHaveProperty("workplaceRating");
    expect(snapshot.roles[0]).not.toHaveProperty("uniform");
    expect(JSON.stringify(snapshot)).not.toContain("share");
  });
});

describe("Work Map career-fact attachment", () => {
  it("links the matching role fact and achievement claims without rewriting the authored list", () => {
    const attached = attachFactsToWorkMapRole(sampleRole(), [
      sampleFact({
        id: "role-fact",
        factType: "role",
        subjectId: "role-1",
        version: 2,
        evidenceIds: ["ev-role"],
        value: { title: "Systems Technician" },
      }),
      sampleFact({
        id: "claim-1",
        factType: "achievement",
        subjectId: "role-1",
        version: 4,
        evidenceIds: ["ev-claim"],
        value: { statement: "Cut recovery from 42 to 11 minutes." },
      }),
      sampleFact({
        id: "other",
        factType: "achievement",
        subjectId: "role-2",
        value: { statement: "Unrelated claim." },
      }),
      sampleFact({
        id: "old",
        factType: "role",
        subjectId: "role-1",
        status: "superseded",
        value: { title: "Technician" },
      }),
    ]);

    expect(attached.factId).toBe("role-fact");
    expect(attached.factVersion).toBe(2);
    expect(attached.evidenceIds).toEqual(["ev-role", "ev-claim"]);
    expect(attached.claims).toEqual([
      {
        text: "Cut recovery from 42 to 11 minutes.",
        factId: "claim-1",
        factVersion: 4,
        evidenceIds: ["ev-claim"],
      },
    ]);
    expect(attached.achievements).toEqual(["Reduced recovery time."]);
  });

  it("plans create and supersede operations from Work Map edits", () => {
    const created = planWorkMapRoleFactSync({
      role: sampleRole({
        kind: "school",
        achievements: ["Dean’s list", "Dean’s list", ""],
      }),
      facts: [],
      evidenceId: "ev-1",
    });
    expect(created).toEqual([
      expect.objectContaining({
        action: "create",
        values: expect.objectContaining({
          factType: "education",
          subjectId: "role-1",
        }),
      }),
      expect.objectContaining({
        action: "create",
        values: expect.objectContaining({
          factType: "achievement",
          value: { statement: "Dean’s list" },
        }),
      }),
    ]);

    const unchanged = planWorkMapRoleFactSync({
      role: sampleRole({ title: "Lead" }),
      facts: [
        sampleFact({
          id: "role-fact",
          factType: "role",
          subjectId: "role-1",
          value: {
            title: "Lead",
            company: "Current Co",
            location: "Philadelphia",
            startDate: "2024-01-01",
            endDate: "",
            isCurrent: true,
            description: "Maintained automated systems.",
          },
        }),
        sampleFact({
          id: "claim-1",
          factType: "achievement",
          subjectId: "role-1",
          value: { statement: "Reduced recovery time." },
        }),
      ],
      evidenceId: "ev-2",
    });
    expect(unchanged).toEqual([]);

    const changed = planWorkMapRoleFactSync({
      role: sampleRole({
        title: "Principal",
        achievements: ["Reduced recovery time.", "Mentored the night shift."],
      }),
      facts: [
        sampleFact({
          id: "role-fact",
          factType: "role",
          subjectId: "role-1",
          evidenceIds: ["ev-old"],
          value: {
            title: "Systems Technician",
            company: "Current Co",
            start_date: "2024-01-01",
            is_current: 1,
            location: "Philadelphia",
            description: "Maintained automated systems.",
          },
        }),
        sampleFact({
          id: "claim-1",
          factType: "achievement",
          subjectId: "role-1",
          value: { statement: "Reduced recovery time." },
        }),
      ],
      evidenceId: "ev-2",
    });
    expect(changed).toEqual([
      expect.objectContaining({
        action: "supersede",
        entityId: "role-fact",
        values: expect.objectContaining({
          evidenceIds: ["ev-old", "ev-2"],
        }),
      }),
      expect.objectContaining({
        action: "create",
        values: expect.objectContaining({
          factType: "achievement",
          value: { statement: "Mentored the night shift." },
        }),
      }),
    ]);
  });
});

describe("Work Map publication settings", () => {
  const current: WorkMapPublicationSettings = {
    slug: "career-map",
    targetRole: "Systems leader",
    theme: "dark",
    visibility: "unlisted",
    sections: ["profile", "history"],
    hideCurrentEmployer: false,
    showExactLocations: false,
    expiresAt: null,
  };

  it("blocks a snapshot while visibility is private", () => {
    expect(publicationAllowsSnapshot("private")).toBe(false);
    expect(publicationAllowsSnapshot("unlisted")).toBe(true);
    expect(publicationAllowsSnapshot("public")).toBe(true);
  });

  it("asks for audience before the first live snapshot", () => {
    expect(
      publicationNeedsAudienceConfirm({ visibility: "unlisted" }),
    ).toBe(true);
    expect(
      publicationNeedsAudienceConfirm({
        visibility: "unlisted",
        liveStatus: "revoked",
      }),
    ).toBe(true);
    expect(
      publicationNeedsAudienceConfirm({
        visibility: "private",
        liveStatus: "published",
      }),
    ).toBe(true);
    expect(
      publicationNeedsAudienceConfirm({
        visibility: "unlisted",
        liveStatus: "published",
      }),
    ).toBe(false);
  });

  it("plans a settings transition only when disclosure knobs change", () => {
    expect(
      planWorkMapPublicationSettings({ current, next: current }),
    ).toEqual([]);
    expect(
      planWorkMapPublicationSettings({
        current,
        next: { ...current, visibility: "public", hideCurrentEmployer: true },
      }),
    ).toEqual([
      {
        action: "transition",
        entityType: "work-map-publication-settings",
        values: {
          from: current,
          to: { ...current, visibility: "public", hideCurrentEmployer: true },
        },
      },
    ]);
  });
});

describe("Work Map sites", () => {
  it("requires coordinates and keeps a site private until approved", () => {
    expect(prepareWorkMapLocation({ label: "Plant" })).toEqual({
      ok: false,
      error: "coordinates-required",
    });
    expect(
      prepareWorkMapLocation({
        label: "  Main plant ",
        address: "  1 Factory Rd ",
        latitude: "39.75",
        longitude: -84.19,
        kind: "site",
      }),
    ).toEqual({
      ok: true,
      value: {
        label: "Main plant",
        address: "1 Factory Rd",
        latitude: 39.75,
        longitude: -84.19,
        kind: "site",
        isPublic: false,
      },
    });
  });

  it("turns a looked-up place into a work site pin", () => {
    expect(
      presentWorkMapPlace({
        name: "Acme Robotics",
        displayName: "Acme Robotics, Dayton, OH, United States",
        latitude: 39.7589,
        longitude: -84.1916,
      }),
    ).toEqual({
      label: "Acme Robotics",
      address: "Acme Robotics, Dayton, OH, United States",
      latitude: 39.7589,
      longitude: -84.1916,
    });
  });
});

function sampleRole(overrides: Partial<WorkMapRole> = {}): WorkMapRole {
  return {
    id: "role-1",
    kind: "job",
    title: "Systems Technician",
    organization: "Current Co",
    locationLabel: "Philadelphia",
    startDate: "2024-01-01",
    endDate: "",
    isCurrent: true,
    description: "Maintained automated systems.",
    achievements: ["Reduced recovery time."],
    factId: null,
    factVersion: null,
    evidenceIds: [],
    claims: [],
    locations: [
      {
        id: "location-1",
        label: "Plant",
        address: "123 Private Street",
        latitude: 39.95258,
        longitude: -75.16522,
        kind: "primary",
        isPublic: true,
      },
    ],
    media: [
      {
        id: "public",
        kind: "photo",
        title: "Robot cell",
        url: "/public.jpg",
        caption: "",
        isPublic: true,
      },
      {
        id: "private",
        kind: "photo",
        title: "Control panel",
        url: "/private.jpg",
        caption: "",
        isPublic: false,
      },
    ],
    details: {
      ...structuredClone(EMPTY_WORK_MAP_DETAILS),
      compensation: {
        currency: "USD",
        period: "annual",
        amount: 150_000,
        visibility: "private",
      },
      schedule: {
        shift: "SECRET_NIGHT_SHIFT",
        hoursPerWeek: 60,
        workMode: "onsite",
      },
      benefits: ["SECRET_BENEFIT"],
      paidTimeOff: "SECRET_PTO",
      environment: "SECRET_ENV",
      growth: "SECRET_GROWTH_NOTE",
      departure: "SECRET_DEPARTURE",
      workplaceRating: 4,
      equipment: ["SECRET_TOOL"],
    },
    ...overrides,
  };
}

function sampleFact(
  overrides: Partial<CareerFactVersion> & Pick<CareerFactVersion, "id" | "factType">,
): CareerFactVersion {
  return {
    occupantId: "local",
    subjectId: "role-1",
    value: {},
    evidenceIds: ["ev-1"],
    sensitivity: "private",
    version: 1,
    status: "canonical",
    supersedesId: null,
    createdAt: "2026-09-19T20:00:00.000Z",
    ...overrides,
  };
}
