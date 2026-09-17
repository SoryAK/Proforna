import { describe, expect, it } from "vitest";
import {
  currentJob,
  formatCareerSpan,
  presentCareerFile,
  type CareerHistoryRecord,
} from "./career-file";

function record(
  overrides: Partial<CareerHistoryRecord> & Pick<CareerHistoryRecord, "id" | "kind">,
): CareerHistoryRecord {
  return {
    title: "",
    company: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
    achievements: [],
    degree: "",
    field: "",
    ...overrides,
  };
}

describe("presentCareerFile", () => {
  it("splits jobs and schools and lists current work first", () => {
    const file = presentCareerFile(
      [
        record({
          id: "old",
          kind: "job",
          title: "Intern",
          company: "Acme",
          startDate: "2018-01-01",
        }),
        record({
          id: "now",
          kind: "job",
          title: "Lead",
          company: "Acme",
          startDate: "2024-01-01",
          isCurrent: true,
        }),
        record({
          id: "school",
          kind: "school",
          title: "Education",
          company: "City College",
          degree: "AAS",
          field: "Electrical",
          startDate: "2016-01-01",
        }),
      ],
      ["TypeScript", "  ", "Conduit"],
    );

    expect(file.jobs.map((job) => job.id)).toEqual(["now", "old"]);
    expect(file.schools).toEqual([
      expect.objectContaining({
        id: "school",
        institution: "City College",
        degree: "AAS",
        field: "Electrical",
      }),
    ]);
    expect(file.skills).toEqual(["TypeScript", "Conduit"]);
    expect(currentJob(file)).toMatchObject({ id: "now", title: "Lead" });
  });

  it("has no current job when none is marked current", () => {
    const file = presentCareerFile(
      [
        record({
          id: "old",
          kind: "job",
          title: "Intern",
          company: "Acme",
        }),
      ],
      [],
    );
    expect(currentJob(file)).toBeNull();
  });
});

describe("formatCareerSpan", () => {
  it("shows Present for current roles", () => {
    expect(formatCareerSpan("2024-03-01", "", true)).toBe("2024-03 – Present");
  });

  it("stays blank when nothing was recorded", () => {
    expect(formatCareerSpan("", "", false)).toBe("");
  });
});
