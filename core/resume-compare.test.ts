import { describe, expect, it } from "vitest";
import { blankOnboardingCheckItem, type OnboardingCheckItem } from "./onboarding-review";
import {
  addHeldRole,
  applySameRole,
  evidenceLinksFit,
  followSkillEdits,
  hintHeldRoles,
  hintNextResume,
  historyFromHeld,
  dropSetAside,
  heldFromCareer,
  hintSetAside,
  holdVerifiedRoles,
  parseHistoryEvidence,
  queuedResumeDuplicate,
  resumesToQueue,
  rememberSetAside,
  rememberSkills,
  reviseSkills,
  skillLines,
  roleFieldDiffs,
  roleTookFile,
  type HeldRole,
} from "./resume-compare";
import type { ExtractedResume } from "./resume-extract";

function item(patch: Partial<OnboardingCheckItem> & Pick<OnboardingCheckItem, "source" | "org" | "title">): OnboardingCheckItem {
  const blank = blankOnboardingCheckItem(patch.source === "school" ? "School" : "Job", patch.sourceIndex ?? 0);
  return {
    ...blank,
    sourceIndex: 0,
    startDate: "2020-01-01",
    endDate: "2022-01-01",
    ...patch,
  };
}

function held(id: string, role: OnboardingCheckItem, file = 0): HeldRole {
  return {
    id,
    item: role,
    evidenceFiles: [file],
    achievementFiles: role.achievements.map(() => file),
  };
}

describe("queued resumes", () => {
  it("recognizes identical bytes already in the list", () => {
    expect(queuedResumeDuplicate(["abc", "def"], "ABC")).toBe(true);
    expect(queuedResumeDuplicate(["abc"], "xyz")).toBe(false);
  });

  it("keeps a selection of new files and skips ones already queued", () => {
    expect(resumesToQueue(["abc"], ["abc", "def", "ghi", "def"])).toEqual({ indexes: [1, 2], skipped: 2 });
  });

  it("keeps every file when none are queued yet", () => {
    expect(resumesToQueue([], ["abc", "def"])).toEqual({ indexes: [0, 1], skipped: 0 });
  });
});

describe("resume compare", () => {
  const engineer = item({
    source: "job",
    sourceIndex: 0,
    org: "Acme",
    title: "Mechanical Engineer",
    startDate: "2018-01-01",
    endDate: "2020-06-01",
    achievements: ["Kept a line"],
  });
  const analyst = item({
    source: "job",
    sourceIndex: 1,
    org: "Northwind",
    title: "Analyst",
    startDate: "2014-01-01",
    endDate: "2016-01-01",
  });

  it("asks about a kept role before a role from an earlier file", () => {
    const kept = [{ ...holdVerifiedRoles([engineer], 0)[0], id: "kept-engineer" }];
    const earlier = holdVerifiedRoles([item({ ...engineer, sourceIndex: 1 })], 0);
    const incoming = item({ ...engineer, sourceIndex: 2, title: "Engineer" });
    expect(hintNextResume(kept, earlier, incoming, [], "later")?.roleId).toBe("kept-engineer");
  });

  it("uses an earlier file when the kept match was declined", () => {
    const kept = holdVerifiedRoles([engineer], 0);
    const earlier = holdVerifiedRoles([item({ ...engineer, sourceIndex: 1 })], 1);
    const incoming = item({ ...engineer, sourceIndex: 2, title: "Engineer" });
    expect(hintNextResume(kept, earlier, incoming, [`${kept[0].id}|later`], "later")?.roleId).toBe(earlier[0].id);
  });

  it("does not treat a shortened title as the same wording", () => {
    const roles = holdVerifiedRoles([engineer], 0);
    const incoming = item({
      ...engineer,
      title: "Engineer",
    });
    expect(hintHeldRoles(roles, incoming)).toEqual([
      { roleId: roles[0].id, reason: "employer-and-dates" },
    ]);
    expect(applySameRole(roles[0], incoming, 1, []).item.title).toBe("Mechanical Engineer");
    const taken = applySameRole(roles[0], incoming, 1, [{ field: "title" }]);
    expect(taken.item.title).toBe("Engineer");
    expect(taken.evidenceFiles).toEqual([0, 1]);
  });

  it("does not treat a disagreeing date as the stored date", () => {
    const roles = [held("job", engineer)];
    const incoming = item({
      source: "job",
      org: "Acme Inc.",
      title: "Mechanical Engineer",
      startDate: "2022-01-01",
      endDate: "2024-01-01",
    });
    expect(hintHeldRoles(roles, incoming)).toEqual([{ roleId: "job", reason: "employer" }]);
    expect(applySameRole(roles[0], incoming, 1, []).item.startDate).toBe("2018-01-01");
  });

  it("does not collapse a promotion at the same employer", () => {
    const roles = [held("job", engineer)];
    const incoming = item({
      source: "job",
      org: "Acme",
      title: "Senior Mechanical Engineer",
      startDate: "2020-06-01",
      endDate: "",
      isCurrent: true,
    });
    expect(hintHeldRoles(roles, incoming)[0]?.reason).toBe("promotion");
    expect(roles[0].item.title).toBe("Mechanical Engineer");
    const added = addHeldRole(roles, incoming, 1);
    expect(added.map((role) => role.item.title)).toEqual([
      "Mechanical Engineer",
      "Senior Mechanical Engineer",
    ]);
  });

  it("leaves a role this file never mentions", () => {
    const roles = [held("old", analyst), held("recent", engineer)];
    const incoming = item({ ...engineer, title: "Mechanical Engineer" });
    expect(hintHeldRoles(roles, incoming).some((hint) => hint.roleId === "old")).toBe(false);
    expect(roles.map((role) => role.id)).toEqual(["old", "recent"]);
  });

  it("does not restore a role that was set aside", () => {
    const kept = holdVerifiedRoles([engineer], 0);
    const later = item({ ...analyst, sourceIndex: 0 });
    expect(hintHeldRoles(kept, later)).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(addHeldRole(kept, later, 1)).toHaveLength(2);
  });

  it("asks before adding a duty and keeps the duty on the file that supplied it", () => {
    const roles = holdVerifiedRoles([engineer], 0);
    expect(roleFieldDiffs(roles[0].item, item({ ...engineer, achievements: ["Kept a line", "New duty"] }))).toEqual([
      { field: "achievement", incoming: "New duty" },
    ]);
    const noted = item({ ...engineer, description: "Kept the notes", achievements: ["Kept a line"] });
    expect(
      roleFieldDiffs(
        noted,
        item({
          ...engineer,
          description: "Kept the notes.",
          achievements: ["Kept a line.", "New duty!"],
        }),
      ),
    ).toEqual([{ field: "achievement", incoming: "New duty!" }]);
    const taken = applySameRole(roles[0], item({ ...engineer, achievements: ["New duty"] }), 1, [
      { field: "achievement", text: "New duty" },
    ]);
    expect(taken.item.achievements).toEqual(["Kept a line", "New duty"]);
    expect(taken.achievementFiles).toEqual([0, 1]);
    expect(taken.evidenceFiles).toEqual([0]);
  });

  it("names a set-aside role without restoring it", () => {
    const analyst = item({
      source: "job",
      sourceIndex: 1,
      org: "Northwind",
      title: "Analyst",
      startDate: "2014-01-01",
      endDate: "2016-01-01",
    });
    const kept = holdVerifiedRoles([engineer], 0);
    const asides = rememberSetAside([], analyst);
    const later = item({ ...analyst, sourceIndex: 0 });
    expect(hintHeldRoles(kept, later)).toEqual([]);
    expect(hintSetAside(asides, later)?.id).toBe(asides[0]?.id);
    expect(kept).toHaveLength(1);
    expect(dropSetAside(asides, asides[0].id)).toEqual([]);
  });

  it("keeps the stored role id when comparing a later resume", () => {
    const held = heldFromCareer({
      jobs: [
        {
          id: "job-7",
          title: "Engineer",
          company: "Acme",
          location: "",
          startDate: "2018-01-01",
          endDate: "2020-01-01",
          isCurrent: false,
          description: "",
          achievements: ["Kept a line"],
        },
      ],
      schools: [],
    });
    expect(held[0]?.id).toBe("job-7");
    expect(held[0]?.evidenceFiles).toEqual([]);
    expect(roleTookFile(applySameRole(held[0], item({ ...held[0].item, title: "Lead" }), 0, [{ field: "title" }]), 0)).toBe(
      true,
    );
  });

  it("does not match a school to a job at the same name", () => {
    const roles = holdVerifiedRoles([engineer], 0);
    const school = item({ source: "school", org: "Acme", title: "AAS", sourceIndex: 0 });
    expect(hintHeldRoles(roles, school)).toEqual([]);
  });
});

describe("historyFromHeld", () => {
  it("writes the session once and points an accepted duty at the later file", () => {
    const [role] = holdVerifiedRoles(
      [
        item({
          source: "job",
          org: "Acme",
          title: "Engineer",
          achievements: ["First duty"],
          lat: 39.95,
          lng: -75.16,
          place: "Philadelphia, PA",
        }),
      ],
      0,
    );
    const merged = applySameRole(role, item({ ...role.item, achievements: ["Second duty"] }), 1, [
      { field: "achievement", text: "Second duty" },
    ]);
    const skills = rememberSkills([], ["Machining"], 0, true);
    const history = historyFromHeld([merged], skills);
    expect(history.experience[0]).toMatchObject({
      company: "Acme",
      title: "Engineer",
      achievements: ["First duty", "Second duty"],
      site: { latitude: 39.95, longitude: -75.16 },
    });
    expect(history.experienceEvidence[0]).toEqual({
      files: [0],
      achievements: [0, 1],
    });
    expect(history.skillFiles).toEqual([0]);
  });

  it("drops skills when the file was not accepted", () => {
    expect(rememberSkills([{ name: "Machining", sourceFile: 0 }], ["Welding"], 1, false)).toEqual([
      { name: "Machining", sourceFile: 0 },
    ]);
  });

  it("revises found skills from one line each", () => {
    const found = [
      { name: "Machining", sourceFile: 1 },
      { name: "Welding", sourceFile: 0 },
    ];
    expect(reviseSkills(found, ["  machining ", "", "PLC", "plc", "CAD"])).toEqual([
      { name: "machining", sourceFile: 1 },
      { name: "PLC", sourceFile: -1 },
      { name: "CAD", sourceFile: -1 },
    ]);
    expect(skillLines(found)).toBe("Machining\nWelding");
    expect(
      followSkillEdits(found, { lines: ["Machining", "CAD"], seen: ["Machining", "Welding"] }),
    ).toEqual([
      { name: "Machining", sourceFile: 1 },
      { name: "CAD", sourceFile: -1 },
    ]);
    expect(
      followSkillEdits(
        [...found, { name: "Lathe", sourceFile: 2 }],
        { lines: ["Machining"], seen: ["Machining", "Welding"] },
      ).map((skill) => skill.name),
    ).toEqual(["Machining", "Lathe"]);
  });
});

describe("parseHistoryEvidence", () => {
  it("keeps a save that names one resume", () => {
    expect(parseHistoryEvidence({ resumeId: "resume-1", experience: [] })).toEqual({
      ok: true,
      links: null,
    });
  });

  it("reads a per-file evidence block", () => {
    const extracted: ExtractedResume = {
      profile: {
        headline: "",
        bio: "",
        location: "",
        website: "",
        githubUrl: "",
        linkedinUrl: "",
      },
      experience: [
        {
          company: "Acme",
          title: "Engineer",
          location: "",
          startDate: "",
          endDate: "",
          isCurrent: false,
          description: "",
          achievements: ["Second duty"],
          site: null,
        },
      ],
      education: [],
      skills: ["Machining"],
    };
    const parsed = parseHistoryEvidence({
      evidence: {
        experience: [{ resumeIds: ["file-a", "file-b"], achievements: ["file-b"] }],
        education: [],
        skills: ["file-a"],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.links) throw new Error("expected links");
    expect(evidenceLinksFit(extracted, parsed.links)).toBe(true);
  });

  it("accepts a skill the occupant typed, with no resume behind it", () => {
    const parsed = parseHistoryEvidence({
      evidence: { experience: [], education: [], skills: [""] },
    });
    expect(parsed).toEqual({ ok: true, links: { experience: [], education: [], skills: [""] } });
  });
});
