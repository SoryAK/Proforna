import { describe, expect, it } from "vitest";
import type { CareerFile } from "./career-file";
import { searchCareerFile } from "./career-search";

const file: CareerFile = {
  jobs: [
    {
      id: "job-1",
      title: "Lead Engineer",
      company: "Acme Corp",
      location: "New York",
      startDate: "2020-01-01",
      endDate: "",
      isCurrent: true,
      description: "Built the grid.",
      achievements: ["Cut outages"],
    },
  ],
  schools: [
    {
      id: "school-1",
      institution: "City College",
      degree: "B.S.",
      field: "Electrical Engineering",
      location: "NY",
      startDate: "2012-01-01",
      endDate: "2016-01-01",
      description: "",
    },
  ],
  skills: ["Wiring", "Panel design"],
};

describe("searchCareerFile", () => {
  it("returns nothing until there is a query", () => {
    expect(searchCareerFile(file, "  ")).toEqual([]);
  });

  it("matches jobs by title, company, and achievement", () => {
    expect(searchCareerFile(file, "acme").map((hit) => hit.id)).toEqual(["job-1"]);
    expect(searchCareerFile(file, "outages").map((hit) => hit.kind)).toEqual([
      "job",
    ]);
  });

  it("matches schools and skills", () => {
    expect(searchCareerFile(file, "electrical").map((hit) => hit.kind)).toEqual([
      "school",
    ]);
    expect(searchCareerFile(file, "panel").map((hit) => hit.title)).toEqual([
      "Panel design",
    ]);
  });
});
