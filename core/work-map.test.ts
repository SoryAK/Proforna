import { describe, expect, it } from "vitest";
import type { CareerFactVersion } from "./career-memory";
import {
  EMPTY_WORK_MAP_DETAILS,
  attachFactsToWorkMapRole,
  buildWorkMapSnapshot,
  groupLinkedEvidence,
  linkedEvidenceFromPage,
  roleCoverPhoto,
  planLinkedEvidenceFacts,
  planWorkMapPublicationSettings,
  planWorkMapRoleFactSync,
  prepareLinkedEvidence,
  prepareLinkedEvidenceDelete,
  prepareWorkMapLocation,
  prepareWorkMapRoleCreate,
  prepareWorkMapRoleDelete,
  nominatimAddressLine,
  presentWorkMapPlace,
  publicationAllowsSnapshot,
  publicationNeedsAudienceConfirm,
  previewRoleMark,
  recruiterWorkMapSnapshot,
  workSitePublicationNote,
  type WorkMapPublicationSettings,
  type WorkMapRole,
} from "./work-map";

describe("role cover photo", () => {
  it("uses the newest photo on the role", () => {
    expect(
      roleCoverPhoto([
        {
          id: "older",
          kind: "photo",
          title: "Shop floor",
          url: "/older.jpg",
          caption: "",
          isPublic: false,
        },
        {
          id: "note",
          kind: "attachment",
          title: "Notes",
          url: "/notes.pdf",
          caption: "",
          isPublic: false,
        },
        {
          id: "newer",
          kind: "photo",
          title: "Cell",
          url: "/newer.jpg",
          caption: "",
          isPublic: false,
        },
      ])?.id,
    ).toBe("newer");
    expect(roleCoverPhoto([])).toBeNull();
  });
});

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

  it("marks a role from whether its work sites would be sent", () => {
    expect(previewRoleMark([])).toBe("Included");
    expect(previewRoleMark([{ isPublic: true }])).toBe("Included");
    expect(previewRoleMark([{ isPublic: false }])).toBe("Only on this preview");
  });

  it("shows a recruiter only the work sites a publication would send", () => {
    const snapshot = {
      roles: [
        {
          locations: [
            {
              id: "private-site",
              label: "",
              address: "Allentown, PA",
              latitude: 39.95258,
              longitude: -75.16522,
              kind: "primary" as const,
              isPublic: false,
            },
            {
              id: "public-site",
              label: "",
              address: "Philadelphia, PA",
              latitude: 39.95258,
              longitude: -75.16522,
              kind: "primary" as const,
              isPublic: true,
            },
          ],
        },
      ],
    };
    const recruiter = recruiterWorkMapSnapshot(snapshot, false);
    expect(recruiter.roles[0]?.locations).toEqual([
      expect.objectContaining({
        id: "public-site",
        latitude: 40,
        longitude: -75.2,
      }),
    ]);
    const exact = recruiterWorkMapSnapshot(snapshot, true);
    expect(exact.roles[0]?.locations[0]?.latitude).toBe(39.95258);
  });

  it("names whether a work site would be sent in a publication", () => {
    expect(
      workSitePublicationNote({ isPublic: false, exactLocations: false }),
    ).toBe("Only on this preview");
    expect(
      workSitePublicationNote({ isPublic: true, exactLocations: false }),
    ).toBe("Included. A publication uses a coarser pin.");
    expect(
      workSitePublicationNote({ isPublic: true, exactLocations: true }),
    ).toBe("Included");
  });

  it("shows a private work site on a local preview without its street", () => {
    const role = sampleRole();
    role.locations = [
      {
        ...role.locations[0],
        isPublic: false,
        address: "88 Hidden Plant Road, Allentown, PA",
      },
    ];
    const snapshot = buildWorkMapSnapshot({
      id: "snapshot-preview",
      occupantId: "local",
      profile: {
        fullName: "Sory Kaba",
        headline: "",
        city: "Philadelphia",
        state: "PA",
        bio: "",
        linkedinUrl: "",
        githubUrl: "",
        portfolioUrl: "",
      },
      roles: [role],
      skills: [],
      settings: {
        slug: "sory-map",
        targetRole: "",
        theme: "dark",
        visibility: "unlisted",
        sections: ["history", "map"],
        hideCurrentEmployer: false,
        showExactLocations: false,
        expiresAt: null,
      },
      sourceFingerprint: "abc",
      createdAt: "2026-09-19T20:00:00.000Z",
      previewLocations: true,
    });
    expect(snapshot.roles[0].locations).toHaveLength(1);
    expect(snapshot.roles[0].locations[0].address).toBe("Allentown, PA");
    expect(snapshot.roles[0].place).toBe("Allentown, PA");
    expect(snapshot.roles[0].locations[0].latitude).toBe(39.95258);
    expect(snapshot.roles[0].locations[0].longitude).toBe(-75.16522);
    expect(JSON.stringify(snapshot)).not.toContain("88 Hidden Plant Road");
    const published = buildWorkMapSnapshot({
      id: "snapshot-published",
      occupantId: "local",
      profile: {
        fullName: "Sory Kaba",
        headline: "",
        city: "",
        state: "",
        bio: "",
        linkedinUrl: "",
        githubUrl: "",
        portfolioUrl: "",
      },
      roles: [role],
      skills: [],
      settings: {
        slug: "sory-map",
        targetRole: "",
        theme: "dark",
        visibility: "unlisted",
        sections: ["history", "map"],
        hideCurrentEmployer: false,
        showExactLocations: false,
        expiresAt: null,
      },
      sourceFingerprint: "abc",
      createdAt: "2026-09-19T20:00:00.000Z",
    });
    expect(published.roles[0].locations).toHaveLength(0);
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

describe("Work Map role create", () => {
  it("accepts only job, internship, or school when creating a role", () => {
    expect(prepareWorkMapRoleCreate({ kind: "job" })).toEqual({
      ok: true,
      value: { kind: "job" },
    });
    expect(prepareWorkMapRoleCreate({ kind: "internship" })).toEqual({
      ok: true,
      value: { kind: "internship" },
    });
    expect(prepareWorkMapRoleCreate({ kind: "school" })).toEqual({
      ok: true,
      value: { kind: "school" },
    });
    expect(prepareWorkMapRoleCreate({ kind: "gig" })).toEqual({
      ok: false,
      error: "kind-invalid",
    });
  });
});

describe("Work Map role delete", () => {
  it("requires a role id", () => {
    expect(prepareWorkMapRoleDelete({ id: " role-1 " })).toEqual({
      ok: true,
      value: { id: "role-1" },
    });
    expect(prepareWorkMapRoleDelete({ id: "  " })).toEqual({
      ok: false,
      error: "role-missing",
    });
  });
});

describe("Linked Evidence", () => {
  it("accepts a review that credits work on the role", () => {
    expect(
      prepareLinkedEvidence(
        {
          url: " https://reviews.example/fold-hands-on ",
          title: " The crease is finally gone ",
          outlet: " Reviews Weekly ",
          publishedOn: "2026-08-14",
          kind: "review",
          contribution: " Designed the hinge fix the review praises. ",
          credit: "about-my-work",
          quote: " You cannot feel the fold anymore. ",
          timestamp: "",
          pin: { kind: "achievement", statement: "Reduced recovery time." },
          isPublic: true,
        },
        sampleRole(),
      ),
    ).toEqual({
      ok: true,
      value: {
        url: "https://reviews.example/fold-hands-on",
        title: "The crease is finally gone",
        outlet: "Reviews Weekly",
        publishedOn: "2026-08-14",
        kind: "review",
        contribution: "Designed the hinge fix the review praises.",
        credit: "about-my-work",
        quote: "You cannot feel the fold anymore.",
        timestamp: "",
        pin: { kind: "achievement", statement: "Reduced recovery time." },
        isPublic: true,
      },
    });
  });

  it("only links to a web page without credentials", () => {
    for (const url of [
      "",
      "reviews.example/fold",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://me:secret@reviews.example/fold",
    ]) {
      expect(prepareLinkedEvidence(linkedInput({ url }), sampleRole())).toEqual({
        ok: false,
        error: "url-invalid",
      });
    }
  });

  it("needs a title, a known kind, and an honest credit", () => {
    const role = sampleRole();
    expect(prepareLinkedEvidence(linkedInput({ title: "  " }), role)).toEqual({
      ok: false,
      error: "title-required",
    });
    expect(prepareLinkedEvidence(linkedInput({ kind: "rumor" }), role)).toEqual({
      ok: false,
      error: "kind-invalid",
    });
    expect(prepareLinkedEvidence(linkedInput({ credit: "" }), role)).toEqual({
      ok: false,
      error: "credit-invalid",
    });
    expect(
      prepareLinkedEvidence(linkedInput({ kind: "talk", credit: "names-me" }), role),
    ).toMatchObject({ ok: true, value: { kind: "talk", credit: "names-me" } });
  });

  it("pins only to an achievement or event on the same role", () => {
    const role = sampleRole({
      details: {
        ...structuredClone(EMPTY_WORK_MAP_DETAILS),
        events: [
          {
            id: "demo-day",
            date: "2026-05-02",
            title: "Demo day",
            detail: "",
            isPublic: true,
          },
        ],
      },
    });
    expect(
      prepareLinkedEvidence(linkedInput({ pin: { kind: "event", id: "demo-day" } }), role),
    ).toMatchObject({ ok: true, value: { pin: { kind: "event", id: "demo-day" } } });
    expect(
      prepareLinkedEvidence(
        linkedInput({
          pin: { kind: "achievement", statement: " reduced recovery time. " },
        }),
        role,
      ),
    ).toMatchObject({
      ok: true,
      value: { pin: { kind: "achievement", statement: "Reduced recovery time." } },
    });
    for (const pin of [
      { kind: "event", id: "other-role-event" },
      { kind: "achievement", statement: "Won an award I never mentioned." },
      { kind: "milestone", id: "demo-day" },
    ]) {
      expect(prepareLinkedEvidence(linkedInput({ pin }), role)).toEqual({
        ok: false,
        error: "pin-missing",
      });
    }
    expect(prepareLinkedEvidence(linkedInput({ pin: null }), role)).toMatchObject({
      ok: true,
      value: { pin: null },
    });
  });

  it("keeps the publish date and video moment readable", () => {
    const role = sampleRole();
    for (const publishedOn of ["", "2026-08-14"]) {
      expect(prepareLinkedEvidence(linkedInput({ publishedOn }), role)).toMatchObject({
        ok: true,
      });
    }
    for (const publishedOn of ["August 2026", "2026-13-01", "2026-02-30"]) {
      expect(prepareLinkedEvidence(linkedInput({ publishedOn }), role)).toEqual({
        ok: false,
        error: "date-invalid",
      });
    }
    for (const timestamp of ["", "14:32", "1:02:03"]) {
      expect(prepareLinkedEvidence(linkedInput({ timestamp }), role)).toMatchObject({
        ok: true,
        value: { timestamp },
      });
    }
    for (const timestamp of ["soon", "14:75", "1:2:3"]) {
      expect(prepareLinkedEvidence(linkedInput({ timestamp }), role)).toEqual({
        ok: false,
        error: "timestamp-invalid",
      });
    }
  });

  it("removes by id", () => {
    expect(prepareLinkedEvidenceDelete({ id: " linked-1 " })).toEqual({
      ok: true,
      value: { id: "linked-1" },
    });
    expect(prepareLinkedEvidenceDelete({ id: "" })).toEqual({
      ok: false,
      error: "linked-evidence-missing",
    });
  });

  it("fills the form from the page's own tags", () => {
    expect(
      linkedEvidenceFromPage({
        url: "https://www.reviews.example/fold-hands-on",
        title: "Fold review | Reviews Weekly",
        meta: {
          "og:title": "The crease is finally gone",
          "og:site_name": "Reviews Weekly",
          "og:type": "article",
          "article:published_time": "2026-08-14T09:30:00-04:00",
        },
      }),
    ).toEqual({
      title: "The crease is finally gone",
      outlet: "Reviews Weekly",
      publishedOn: "2026-08-14",
      kind: "article",
    });
  });

  it("falls back to the page title and host, and reads videos as talks", () => {
    expect(
      linkedEvidenceFromPage({
        url: "https://www.video.example/watch?v=demo",
        title: " Demo day keynote ",
        meta: { "og:type": "video.other", "article:published_time": "soon" },
      }),
    ).toEqual({
      title: "Demo day keynote",
      outlet: "video.example",
      publishedOn: "",
      kind: "talk",
    });
  });

  it("backs the pinned achievement with the captured copy and lets go when unpinned", () => {
    const facts = [
      sampleFact({
        id: "fact-recovery",
        factType: "achievement",
        value: { statement: "Reduced recovery time." },
        evidenceIds: ["resume"],
      }),
      sampleFact({
        id: "fact-award",
        factType: "achievement",
        value: { statement: "Won the design award." },
        evidenceIds: ["capture-1"],
      }),
    ];
    const pinned = (statement: string, evidenceId: string) => ({
      evidenceId,
      pin: { kind: "achievement" as const, statement },
    });

    expect(
      planLinkedEvidenceFacts({
        roleId: "role-1",
        facts,
        before: null,
        after: pinned("Reduced recovery time.", "capture-1"),
      }),
    ).toEqual([
      {
        action: "supersede",
        entityType: "career-fact",
        entityId: "fact-recovery",
        values: {
          factType: "achievement",
          subjectId: "role-1",
          value: { statement: "Reduced recovery time." },
          evidenceIds: ["resume", "capture-1"],
        },
      },
    ]);

    expect(
      planLinkedEvidenceFacts({
        roleId: "role-1",
        facts: [
          sampleFact({
            id: "fact-recovery",
            factType: "achievement",
            value: { statement: "Reduced recovery time." },
            evidenceIds: ["resume", "capture-1"],
          }),
        ],
        before: pinned("Reduced recovery time.", "capture-1"),
        after: null,
      }),
    ).toEqual([
      expect.objectContaining({
        entityId: "fact-recovery",
        values: expect.objectContaining({ evidenceIds: ["resume"] }),
      }),
    ]);

    expect(
      planLinkedEvidenceFacts({
        roleId: "role-1",
        facts,
        before: pinned("Won the design award.", "capture-1"),
        after: null,
      }),
    ).toEqual([]);

    expect(
      planLinkedEvidenceFacts({
        roleId: "role-1",
        facts,
        before: { evidenceId: "capture-1", pin: { kind: "event", id: "demo-day" } },
        after: { evidenceId: null, pin: { kind: "achievement", statement: "Reduced recovery time." } },
      }),
    ).toEqual([]);
  });

  it("groups evidence under the achievement it supports for readers", () => {
    const review = { id: "review", pin: { kind: "achievement" as const, statement: "Solved the crease." } };
    const talk = { id: "talk", pin: { kind: "event" as const, id: "demo-day" } };
    const press = { id: "press", pin: null };
    const stale = { id: "stale", pin: { kind: "achievement" as const, statement: "Old wording." } };
    expect(
      groupLinkedEvidence(["Solved the crease.", "Mentored interns."], [review, talk, press, stale]),
    ).toEqual({
      achievements: [
        { statement: "Solved the crease.", evidence: [review] },
        { statement: "Mentored interns.", evidence: [] },
      ],
      other: [talk, press, stale],
    });
    expect(groupLinkedEvidence(["Solved the crease."], undefined)).toEqual({
      achievements: [{ statement: "Solved the crease.", evidence: [] }],
      other: [],
    });
  });

  it("publishes only public Linked Evidence when the evidence section is on", () => {
    const role = sampleRole({
      linkedEvidence: [
        {
          id: "shout-out",
          evidenceId: "SECRET_CAPTURE",
          url: "https://video.example/demo-day",
          title: "Demo day keynote",
          outlet: "video.example",
          publishedOn: "2026-05-02",
          kind: "talk",
          contribution: "Built the live demo.",
          credit: "names-me",
          quote: "Huge thanks to the engineer who fixed the fold.",
          timestamp: "14:32",
          pin: { kind: "event", id: "private-event" },
          isPublic: true,
        },
        {
          id: "draft",
          evidenceId: null,
          url: "https://SECRET_LINK.example/",
          title: "SECRET_TITLE",
          outlet: "",
          publishedOn: "",
          kind: "article",
          contribution: "",
          credit: "about-my-work",
          quote: "",
          timestamp: "",
          pin: null,
          isPublic: false,
        },
      ],
      details: {
        ...structuredClone(EMPTY_WORK_MAP_DETAILS),
        events: [
          {
            id: "private-event",
            date: "2026-05-02",
            title: "Demo day",
            detail: "",
            isPublic: false,
          },
        ],
      },
    });
    const publish = (
      sections: WorkMapPublicationSettings["sections"],
      visibility: WorkMapPublicationSettings["visibility"] = "public",
    ) =>
      buildWorkMapSnapshot({
        id: "snapshot-1",
        occupantId: "local",
        profile: {
          fullName: "Sory Kaba",
          headline: "",
          city: "",
          state: "",
          bio: "",
          linkedinUrl: "",
          githubUrl: "",
          portfolioUrl: "",
        },
        roles: [role],
        skills: [],
        settings: {
          slug: "sory",
          targetRole: "",
          theme: "dark",
          visibility,
          sections,
          hideCurrentEmployer: false,
          showExactLocations: false,
          expiresAt: null,
        },
        sourceFingerprint: "abc",
        createdAt: "2026-10-17T20:00:00.000Z",
      });

    const published = publish(["history", "milestones", "evidence"]);
    expect(published.roles[0].linkedEvidence).toEqual([
      {
        id: "shout-out",
        url: "https://video.example/demo-day",
        title: "Demo day keynote",
        outlet: "video.example",
        publishedOn: "2026-05-02",
        kind: "talk",
        contribution: "Built the live demo.",
        credit: "names-me",
        quote: "Huge thanks to the engineer who fixed the fold.",
        timestamp: "14:32",
        pin: null,
        isPublic: true,
      },
    ]);
    expect(JSON.stringify(published)).not.toContain("SECRET_");
    expect(publish(["history"]).roles[0].linkedEvidence).toEqual([]);
    expect(
      publish(["history", "evidence"], "anonymous").roles[0].linkedEvidence,
    ).toEqual([]);
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

  it("turns an OpenStreetMap house into the same street, city, and state a click can keep", () => {
    expect(
      nominatimAddressLine(
        {
          house_number: "67",
          road: "East Broadway Avenue",
          village: "Clifton Heights",
          county: "Delaware County",
          state: "Pennsylvania",
          "ISO3166-2-lvl4": "US-PA",
          postcode: "19018",
          country: "United States",
        },
        "67, East Broadway Avenue, Clifton Heights, Delaware County, Pennsylvania, 19018, United States",
      ),
    ).toBe("67 East Broadway Avenue, Clifton Heights, PA");
  });

  it("keeps the raw place name when OpenStreetMap has no street", () => {
    expect(
      nominatimAddressLine(
        { village: "Clifton Heights", state: "Pennsylvania" },
        "Clifton Heights, Pennsylvania, United States",
      ),
    ).toBe("Clifton Heights, Pennsylvania, United States");
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
    linkedEvidence: [],
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

function linkedInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    url: "https://reviews.example/fold-hands-on",
    title: "The crease is finally gone",
    outlet: "Reviews Weekly",
    publishedOn: "2026-08-14",
    kind: "review",
    contribution: "",
    credit: "about-my-work",
    quote: "",
    timestamp: "",
    pin: null,
    isPublic: false,
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
