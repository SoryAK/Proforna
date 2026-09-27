import { describe, expect, it } from "vitest";
import {
  fillProfileFromExtract,
  isExtractReviewComplete,
  isExtractableResumeText,
  parseExtractedResume,
  parseExtractedResumeText,
  parseHistoryResumeId,
  splitResidence,
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

describe("splitResidence", () => {
  it("puts a street address in the street field and the city beside the state", () => {
    expect(splitResidence("100 Market St, Dayton, OH")).toEqual({
      street: "100 Market St",
      city: "Dayton",
      state: "OH",
    });
  });

  it("leaves the street blank when the resume only names a city", () => {
    expect(splitResidence("Dayton, OH")).toEqual({
      street: "",
      city: "Dayton",
      state: "OH",
    });
  });

  it("reads a house number, county, and full state name as street, city, and code", () => {
    expect(
      splitResidence(
        "100, Market Street, Dayton, Montgomery County, Ohio, 45402, United States",
      ),
    ).toEqual({
      street: "100 Market Street",
      city: "Dayton",
      state: "OH",
    });
  });
});

describe("fillProfileFromExtract", () => {
  it("fills blank profile fields from the resume without overwriting a name", () => {
    expect(
      fillProfileFromExtract(
        {
          fullName: "Sory Kaba",
          headline: "",
          address: "12 Private Lane",
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
      address: "12 Private Lane",
      city: "Dayton",
      state: "OH",
      bio: "Runs conduit.",
      linkedinUrl: "",
      githubUrl: "https://github.com/SoryAK",
      portfolioUrl: "https://sory.example",
    });
  });

  it("fills a blank street from the resume without replacing a city already saved", () => {
    expect(
      fillProfileFromExtract(
        {
          fullName: "Sory Kaba",
          headline: "",
          address: "",
          city: "Kept City",
          state: "",
          bio: "",
          linkedinUrl: "",
          githubUrl: "",
          portfolioUrl: "",
        },
        {
          headline: "",
          bio: "",
          location: "100 Market St, Dayton, OH 45402",
          website: "",
          githubUrl: "",
          linkedinUrl: "",
        },
      ),
    ).toMatchObject({
      address: "100 Market St",
      city: "Kept City",
      state: "OH",
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
