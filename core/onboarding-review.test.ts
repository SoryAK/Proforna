import { describe, expect, it } from "vitest";
import {
  keptOnboardingHistory,
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
      description: "",
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
  it("lists roles and leaves a city unpinned", () => {
    const items = onboardingCheckItems(resume());
    expect(items.map((item) => item.org)).toEqual(["Sharp Packaging", "Dropped Co"]);
    expect(items[0]).toMatchObject({
      source: "job",
      sourceIndex: 0,
      place: "Allentown, PA",
      lat: null,
      lng: null,
    });
  });
});

describe("keptOnboardingHistory", () => {
  it("drops roles that were set aside and pins a street onto the site", () => {
    const kept = keptOnboardingHistory(resume(), [
      {
        source: "job",
        sourceIndex: 0,
        place: "701 Hamilton St, Allentown, PA",
        lat: 40.6,
        lng: -75.47,
      },
    ]);
    expect(kept.experience.map((job) => job.company)).toEqual(["Sharp Packaging"]);
    expect(kept.experience[0]?.site).toEqual({
      label: "701 Hamilton St, Allentown, PA",
      address: "701 Hamilton St, Allentown, PA",
      latitude: 40.6,
      longitude: -75.47,
    });
    expect(kept.education.map((school) => school.institution)).toEqual(["Temple"]);
    expect(kept.skills).toEqual(["PLC"]);
  });

  it("keeps schools and drops skills when every role was set aside", () => {
    const kept = keptOnboardingHistory(resume(), []);
    expect(kept.experience).toEqual([]);
    expect(kept.education.map((school) => school.institution)).toEqual(["Temple"]);
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
