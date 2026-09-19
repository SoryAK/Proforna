import { describe, expect, it } from "vitest";
import {
  EMPTY_WORK_MAP_DETAILS,
  buildWorkMapSnapshot,
  type WorkMapRole,
} from "./work-map";

describe("Work Map publication snapshots", () => {
  it("publishes approved map detail while keeping private evidence and pay out", () => {
    const role: WorkMapRole = {
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
      },
    };
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
    expect(JSON.stringify(snapshot)).not.toContain("150000");
    expect(JSON.stringify(snapshot)).not.toContain("private.jpg");
  });
});
