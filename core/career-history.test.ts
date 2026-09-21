import { describe, expect, it } from "vitest";
import {
  classifyCareerHistorySection,
  formatHistoryGist,
  groupCareerHistory,
  presentCareerHistoryStats,
  searchCareerHistory,
  sortCareerHistory,
  type CareerHistoryItem,
} from "./career-history";

function item(
  overrides: Partial<CareerHistoryItem> & Pick<CareerHistoryItem, "id">,
): CareerHistoryItem {
  return {
    kind: "job",
    title: "Lead",
    organization: "Acme",
    locationLabel: "Dayton, OH",
    startDate: "2024-06-01",
    endDate: "",
    isCurrent: true,
    ...overrides,
  };
}

describe("classifyCareerHistorySection", () => {
  it("groups by stored kind, not by intern words in the title", () => {
    expect(
      classifyCareerHistorySection({ kind: "school", title: "AAS" }),
    ).toBe("school");
    expect(
      classifyCareerHistorySection({ kind: "job", title: "Electrical Intern" }),
    ).toBe("job");
    expect(
      classifyCareerHistorySection({ kind: "internship", title: "Assistant" }),
    ).toBe("internship");
    expect(
      classifyCareerHistorySection({ kind: "job", title: "Lead Electrician" }),
    ).toBe("job");
  });
});

describe("groupCareerHistory", () => {
  it("hides empty categories and keeps current jobs in Jobs", () => {
    const groups = groupCareerHistory([
      item({ id: "job", title: "Lead Electrician" }),
      item({
        id: "intern",
        kind: "internship",
        title: "Electrical Intern",
        isCurrent: false,
        startDate: "2017-05-01",
        endDate: "2017-08-01",
      }),
      item({
        id: "school",
        kind: "school",
        title: "AAS",
        organization: "City College",
        isCurrent: false,
        startDate: "2016-08-01",
        endDate: "2018-05-01",
      }),
    ]);
    expect(groups.map((group) => [group.key, group.items.length])).toEqual([
      ["job", 1],
      ["internship", 1],
      ["school", 1],
    ]);
  });
});

describe("formatHistoryGist", () => {
  it("packs place, month span, and tenure", () => {
    expect(
      formatHistoryGist(
        item({
          id: "job",
          startDate: "2024-06-01",
          isCurrent: true,
        }),
        new Date(2026, 8, 1),
      ),
    ).toBe("Dayton, OH · Jun 2024 – Present (2y 3m)");
  });

  it("uses a mapped city instead of a street number or company name", () => {
    const now = new Date(2026, 8, 1);
    expect(
      formatHistoryGist(
        item({
          id: "giants",
          organization: "Giants Direct",
          locationLabel: "67",
          locations: [
            {
              address:
                "67, East Broadway Avenue, Clifton Heights, Delaware County, Pennsylvania, 19018, United States",
              latitude: 39.929,
              longitude: -75.296,
            },
          ],
        }),
        now,
      ),
    ).toBe("Clifton Heights, PA · Jun 2024 – Present (2y 3m)");
    expect(
      formatHistoryGist(
        item({
          id: "widener",
          organization: "Widener University",
          title: "Robotics Research Intern",
          locationLabel: "Widener University",
          isCurrent: false,
          startDate: "2022-09-01",
          endDate: "2022-12-01",
          locations: [
            {
              address:
                "Widener University, 1, Walnut Street, Chester, Delaware County, Pennsylvania, 19013, United States",
              latitude: 39.86,
              longitude: -75.355,
            },
          ],
        }),
        now,
      ),
    ).toBe("Chester, PA · Sep 2022 – Dec 2022 (3m)");
    expect(
      formatHistoryGist(
        item({
          id: "bare",
          locationLabel: "67",
        }),
        now,
      ),
    ).toBe("Jun 2024 – Present (2y 3m)");
  });
});

describe("presentCareerHistoryStats", () => {
  it("counts work roles, unique cities, and miles between mapped sites", () => {
    const stats = presentCareerHistoryStats(
      [
        item({
          id: "now",
          startDate: "2024-06-01",
          locationLabel: "Dayton, OH",
          locations: [
            { address: "Dayton, OH", latitude: 39.7589, longitude: -84.1916 },
          ],
        }),
        item({
          id: "old",
          title: "Journeyman",
          isCurrent: false,
          startDate: "2018-03-01",
          endDate: "2024-05-01",
          locationLabel: "Columbus, OH",
          locations: [
            {
              address: "Columbus, OH",
              latitude: 39.9612,
              longitude: -82.9988,
            },
          ],
        }),
        item({
          id: "school",
          kind: "school",
          title: "AAS",
          organization: "City College",
          isCurrent: false,
          startDate: "2016-08-01",
          endDate: "2018-05-01",
          locationLabel: "Dayton, OH",
        }),
      ],
      new Date(2026, 8, 1),
    );
    expect(stats.roles).toBe(2);
    expect(stats.cities).toBe(2);
    expect(stats.tenure).toBe("10y 1m");
    expect(stats.miles).toBeGreaterThan(60);
  });
});

describe("searchCareerHistory", () => {
  it("matches organization, title, or place", () => {
    const items = [
      item({ id: "acme", organization: "Acme Field Services" }),
      item({ id: "trades", organization: "County Trades", title: "Instructor" }),
    ];
    expect(searchCareerHistory(items, "county").map((row) => row.id)).toEqual([
      "trades",
    ]);
  });
});

describe("sortCareerHistory", () => {
  it("puts current and later starts first for newest", () => {
    const items = [
      item({
        id: "old",
        isCurrent: false,
        startDate: "2018-03-01",
        endDate: "2024-05-01",
      }),
      item({ id: "now", startDate: "2024-06-01" }),
    ];
    expect(sortCareerHistory(items, "newest").map((row) => row.id)).toEqual([
      "now",
      "old",
    ]);
    expect(sortCareerHistory(items, "oldest").map((row) => row.id)).toEqual([
      "old",
      "now",
    ]);
  });
});
