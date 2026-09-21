import { describe, expect, it } from "vitest";
import {
  fillProfileFromExtract,
  isExtractReviewComplete,
  isExtractableResumeText,
  parseExtractedResume,
  parseExtractedResumeText,
  parseHistoryResumeId,
} from "./resume-extract";

describe("isExtractableResumeText", () => {
  it("rejects scans and tiny snippets", () => {
    expect(isExtractableResumeText("short")).toBe(false);
  });

  it("accepts a page of real text", () => {
    expect(isExtractableResumeText("Sory Kaba ".repeat(20))).toBe(true);
  });
});

describe("parseExtractedResume", () => {
  it("keeps jobs with a company and title, drops the rest", () => {
    const parsed = parseExtractedResume({
      profile: { headline: "Electrician", bio: null },
      experience: [
        { company: "Acme", title: "Lead", isCurrent: true },
        { company: "  ", title: "Ghost" },
      ],
      education: [{ institution: "City College", degree: "AAS" }],
      skills: ["Conduit", ""],
    });
    expect(parsed).toMatchObject({
      profile: { headline: "Electrician", bio: "" },
      experience: [
        { company: "Acme", title: "Lead", isCurrent: true, site: null },
      ],
      education: [{ institution: "City College", degree: "AAS" }],
      skills: ["Conduit"],
    });
  });

  it("keeps a validated work site on a job", () => {
    const parsed = parseExtractedResume({
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
    });
    expect(parsed?.experience[0]?.site).toEqual({
      label: "Main plant",
      address: "Dayton, Ohio, United States",
      latitude: 39.7589,
      longitude: -84.1916,
    });
  });

  it("reads fenced model output", () => {
    const parsed = parseExtractedResumeText(
      "```json\n{\"experience\":[{\"company\":\"Acme\",\"title\":\"Lead\"}],\"education\":[],\"skills\":[]}\n```",
    );
    expect(parsed?.experience[0]?.company).toBe("Acme");
  });
});

describe("fillProfileFromExtract", () => {
  it("fills blank profile fields from the resume without overwriting a name", () => {
    expect(
      fillProfileFromExtract(
        {
          fullName: "Sory Kaba",
          headline: "",
          city: "",
          state: "",
          bio: "",
          linkedinUrl: "",
          githubUrl: "",
          portfolioUrl: "",
        },
        {
          headline: "Electrician",
          bio: "Runs conduit.",
          location: "Dayton, OH",
          website: "https://sory.example",
          githubUrl: "https://github.com/SoryAK",
          linkedinUrl: "not-a-url",
        },
      ),
    ).toEqual({
      fullName: "Sory Kaba",
      headline: "Electrician",
      city: "Dayton",
      state: "OH",
      bio: "Runs conduit.",
      linkedinUrl: "",
      githubUrl: "https://github.com/SoryAK",
      portfolioUrl: "https://sory.example",
    });
  });
});

describe("isExtractReviewComplete", () => {
  it("is ready when there are no jobs", () => {
    expect(isExtractReviewComplete(0, 0)).toBe(true);
  });

  it("waits until every job has been confirmed", () => {
    expect(isExtractReviewComplete(3, 2)).toBe(false);
    expect(isExtractReviewComplete(3, 3)).toBe(true);
  });
});

describe("parseHistoryResumeId", () => {
  it("treats a missing resume id as optional", () => {
    expect(parseHistoryResumeId({ experience: [] })).toEqual({
      ok: true,
      resumeId: null,
    });
  });

  it("keeps a stored resume id", () => {
    expect(
      parseHistoryResumeId({ resumeId: " resume-1 ", experience: [] }),
    ).toEqual({ ok: true, resumeId: "resume-1" });
  });

  it("rejects a resume id that is not a string", () => {
    expect(parseHistoryResumeId({ resumeId: 12 })).toEqual({ ok: false });
  });
});
