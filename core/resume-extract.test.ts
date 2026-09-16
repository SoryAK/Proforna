import { describe, expect, it } from "vitest";
import {
  isExtractableResumeText,
  parseExtractedResume,
  parseExtractedResumeText,
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
      experience: [{ company: "Acme", title: "Lead", isCurrent: true }],
      education: [{ institution: "City College", degree: "AAS" }],
      skills: ["Conduit"],
    });
  });

  it("reads fenced model output", () => {
    const parsed = parseExtractedResumeText(
      "```json\n{\"experience\":[{\"company\":\"Acme\",\"title\":\"Lead\"}],\"education\":[],\"skills\":[]}\n```",
    );
    expect(parsed?.experience[0]?.company).toBe("Acme");
  });
});
