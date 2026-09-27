import { describe, expect, it } from "vitest";
import {
  blankOnboardingCheckItem,
  isBlankOnboardingCheckItem,
  keptOnboardingHistory,
  nextOnboardingSourceIndex,
  onboardingCheckItems,
  profileAfterOnboarding,
} from "./onboarding-review";
import type { ProfileFields } from "./profile";
import { emptyExtractedResume, type ExtractedResume } from "./resume-extract";

const current: ProfileFields = {
  fullName: "Ada Lovelace",
  headline: "",
  address: "12 Private Lane",
  city: "London",
  state: "England",
  bio: "",
  linkedinUrl: "https://www.linkedin.com/in/ada",
  githubUrl: "https://github.com/ada",
  portfolioUrl: "https://ada.example",
};

function resume(): ExtractedResume {
  const data = emptyExtractedResume();
  data.profile = {
    headline: "Mathematician",
    bio: "",
    location: "Allentown, PA",
    website: "https://other.example",
    githubUrl: "",
    linkedinUrl: "https://www.linkedin.com/in/other",
  };
  data.skills = ["PLC"];
  data.experience = [
    {
      company: "Sharp Packaging",
      title: "Technician",
      location: "Allentown, PA",
      startDate: "2023-01-01",
      endDate: "",
      isCurrent: true,
      description: "Ran the packaging line.",
      achievements: ["Kept the line running."],
      site: null,
    },
    {
      company: "Dropped Co",
      title: "Role",
      location: "Reading, PA",
      startDate: "",
      endDate: "",
      isCurrent: false,
      description: "",
      achievements: [],
      site: null,
    },
  ];
  data.education = [
    {
      institution: "Temple",
      degree: "BS",
      field: "Physics",
      location: "Philadelphia, PA",
      startDate: "2021-05-01",
      endDate: "2021-08-01",
      description: "",
    },
  ];
  return data;
}

describe("onboardingCheckItems", () => {
  it("lists roles and schools and leaves a city unpinned", () => {
    const items = onboardingCheckItems(resume());
    expect(items.map((item) => item.org)).toEqual(["Sharp Packaging", "Dropped Co", "Temple"]);
    expect(items[0]).toMatchObject({
      source: "job",
      sourceIndex: 0,
      kind: "Job",
      title: "Technician",
      span: "2023-01 – Present",
      place: "Allentown, PA",
      description: "Ran the packaging line.",
      achievements: ["Kept the line running."],
      lat: null,
      lng: null,
    });
    expect(items[2]).toMatchObject({
      source: "school",
      sourceIndex: 0,
      kind: "School",
      title: "BS",
      field: "Physics",
      place: "Philadelphia, PA",
      span: "2021-05 – 2021-08",
    });
  });
});

describe("keptOnboardingHistory", () => {
  it("drops roles that were set aside, keeps an edit, and pins a street onto the site", () => {
    const items = onboardingCheckItems(resume());
    const role = items[0];
    const school = items[2];
    if (!role || !school) throw new Error("expected a role and a school");
    const kept = keptOnboardingHistory(resume(), [
      {
        ...role,
        title: "Lead Technician",
        description: "Ran both lines.",
        place: "701 Hamilton St, Allentown, PA",
        lat: 40.6,
        lng: -75.47,
      },
      school,
    ]);
    expect(kept.experience.map((job) => job.company)).toEqual(["Sharp Packaging"]);
    expect(kept.experience[0]).toMatchObject({
      title: "Lead Technician",
      description: "Ran both lines.",
      achievements: ["Kept the line running."],
    });
    expect(kept.experience[0]?.site).toEqual({
      label: "701 Hamilton St, Allentown, PA",
      address: "701 Hamilton St, Allentown, PA",
      latitude: 40.6,
      longitude: -75.47,
    });
    expect(kept.education.map((school) => school.institution)).toEqual(["Temple"]);
    expect(kept.skills).toEqual(["PLC"]);
  });

  it("keeps a school and drops skills when every role was set aside", () => {
    const school = onboardingCheckItems(resume()).find((item) => item.source === "school");
    if (!school) throw new Error("expected a school");
    const kept = keptOnboardingHistory(resume(), [
      { ...school, title: "BA", field: "Math", org: "Temple University" },
    ]);
    expect(kept.experience).toEqual([]);
    expect(kept.education[0]).toMatchObject({
      institution: "Temple University",
      degree: "BA",
      field: "Math",
    });
    expect(kept.skills).toEqual([]);
  });

  it("keeps a job and a school added during verify", () => {
    const job = {
      ...blankOnboardingCheckItem("Job", nextOnboardingSourceIndex([], "Job")),
      org: "New Co",
      title: "Lead",
      description: "Built the line.",
      startDate: "2024-01",
      isCurrent: true,
      place: "Dayton, OH",
      lat: 39.7,
      lng: -84.1,
    };
    const school = {
      ...blankOnboardingCheckItem("School", nextOnboardingSourceIndex([], "School")),
      org: "State",
      title: "AS",
      field: "Math",
    };
    expect(isBlankOnboardingCheckItem(blankOnboardingCheckItem("Job", -1))).toBe(true);
    expect(isBlankOnboardingCheckItem(job)).toBe(false);
    const kept = keptOnboardingHistory(resume(), [job, school]);
    expect(kept.experience).toHaveLength(1);
    expect(kept.experience[0]).toMatchObject({
      company: "New Co",
      title: "Lead",
      description: "Built the line.",
      isCurrent: true,
      location: "Dayton, OH",
    });
    expect(kept.experience[0]?.site).toEqual({
      label: "Dayton, OH",
      address: "Dayton, OH",
      latitude: 39.7,
      longitude: -84.1,
    });
    expect(kept.education[0]).toMatchObject({
      institution: "State",
      degree: "AS",
      field: "Math",
    });
    expect(kept.skills).toEqual(["PLC"]);
  });

  it("drops schools that were set aside", () => {
    const kept = keptOnboardingHistory(resume(), []);
    expect(kept.experience).toEqual([]);
    expect(kept.education).toEqual([]);
    expect(kept.skills).toEqual([]);
  });
});

describe("profileAfterOnboarding", () => {
  it("leaves a saved address and links alone when those answers are skipped", () => {
    const next = profileAfterOnboarding({
      current,
      extracted: resume().profile,
      fullName: "Ada Lovelace",
      place: null,
      links: null,
    });
    expect(next.address).toBe("12 Private Lane");
    expect(next.city).toBe("London");
    expect(next.state).toBe("England");
    expect(next.linkedinUrl).toBe("https://www.linkedin.com/in/ada");
    expect(next.githubUrl).toBe("https://github.com/ada");
    expect(next.portfolioUrl).toBe("https://ada.example");
    expect(next.headline).toBe("Mathematician");
  });

  it("keeps a saved city when the confirmed field is blank", () => {
    const next = profileAfterOnboarding({
      current,
      extracted: resume().profile,
      fullName: "  Ada   Lovelace ",
      place: { street: "701 Hamilton St", city: "  ", state: "" },
      links: { linkedinUrl: "", githubUrl: "https://github.com/ada", portfolioUrl: "" },
    });
    expect(next.fullName).toBe("Ada Lovelace");
    expect(next.address).toBe("701 Hamilton St");
    expect(next.city).toBe("London");
    expect(next.state).toBe("England");
    expect(next.linkedinUrl).toBe("https://www.linkedin.com/in/ada");
    expect(next.portfolioUrl).toBe("https://ada.example");
  });
});
