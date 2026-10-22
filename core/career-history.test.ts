import { describe, expect, it } from "vitest";
import {
  careerHistoryCopyKey,
  careerHistoryIdentityKey,
  classifyCareerHistorySection,
  clusterCareerHistory,
  flagIdenticalRoles,
  identicalRoleReviews,
  formatHistoryGist,
  formatHistoryPlace,
  groupCareerHistory,
  presentCareerHistoryStats,
  searchCareerHistory,
  sortCareerHistory,
  type CareerHistoryIdentity,
  type CareerHistoryItem,
} from "./career-history";

function item(
  overrides: Partial<CareerHistoryIdentity> & Pick<CareerHistoryIdentity, "id">,
): CareerHistoryIdentity {
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

  it("keeps the city when the street uses an abbreviation and the state carries a zip", () => {
    expect(
      formatHistoryPlace({
        organization: "Giants Direct",
        locationLabel: "67",
        locations: [
          {
            address: "235 N Reservoir St, Lancaster, PA 17602, USA",
          },
        ],
      }),
    ).toBe("Lancaster, PA");
    expect(
      formatHistoryPlace({
        organization: "Giants Direct",
        locationLabel: "235 N Reservoir St, Lancaster, PA 17602",
      }),
    ).toBe("Lancaster, PA");
  });
});

describe("clusterCareerHistory", () => {
  it("keeps one lead for copies that share organization, title, and start month", () => {
    const clusters = clusterCareerHistory([
      item({
        id: "copy-b",
        organization: "Giants Direct",
        title: "Technician",
        startDate: "2024-06-15",
        locationLabel: "67",
      }),
      item({
        id: "copy-a",
        organization: "giants  direct",
        title: "Technician",
        startDate: "2024-06-01",
        locationLabel: "Lancaster, PA",
        locations: [
          {
            address: "235 N Reservoir St, Lancaster, PA 17602, USA",
            latitude: 40.04,
            longitude: -76.3,
          },
        ],
      }),
      item({
        id: "other",
        organization: "Sharp Packaging",
        title: "Technician",
        startDate: "2024-06-01",
      }),
    ]);
    expect(clusters.map((cluster) => [cluster.lead.id, cluster.copies.length])).toEqual([
      ["copy-a", 2],
      ["other", 1],
    ]);
    expect(careerHistoryCopyKey(clusters[0].lead)).toBe(
      careerHistoryCopyKey(clusters[0].copies[1]),
    );
  });
});

describe("flagIdenticalRoles", () => {
  it("flags records that match in dates, text, and places, and keeps the first", () => {
    const shared = {
      organization: "Giants Direct",
      title: "Technician",
      startDate: "2024-06-01",
      description: "Maintained the robotic line.",
      achievements: ["Replaced relays", "Tuned belts"],
      locationLabel: "Lancaster",
      locations: [
        {
          address: "235 N Reservoir St, Lancaster, PA",
          latitude: 40,
          longitude: -76,
        },
      ],
    };
    const flags = flagIdenticalRoles([
      item({ id: "keep", ...shared }),
      item({
        id: "same",
        ...shared,
        achievements: ["Tuned belts", "Replaced relays"],
        startDate: "2024-06-20",
      }),
      item({
        id: "other-place",
        ...shared,
        locationLabel: "Philadelphia",
        locations: [
          {
            address: "Philadelphia, PA",
            latitude: 39.9,
            longitude: -75.1,
          },
        ],
      }),
    ]);
    expect(flags.get("keep")).toEqual({ count: 2, keeper: true });
    expect(flags.get("same")).toEqual({ count: 2, keeper: false });
    expect(flags.get("other-place")).toEqual({ count: 1, keeper: true });
    expect(identicalRoleReviews([
      item({ id: "keep", ...shared }),
      item({ id: "same", ...shared, startDate: "2024-06-20" }),
      item({
        id: "other-place",
        ...shared,
        locationLabel: "Philadelphia",
        locations: [{ address: "Philadelphia, PA", latitude: 39.9, longitude: -75.1 }],
      }),
    ])).toEqual([{ id: "same", matchesId: "keep" }]);
    expect(careerHistoryIdentityKey(item({ id: "keep", ...shared }))).toBe(
      careerHistoryIdentityKey(
        item({
          id: "same",
          ...shared,
          description: "  Maintained   the robotic line. ",
        }),
      ),
    );
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
    expect(
      presentCareerHistoryStats(
        [
          item({
            id: "a",
            organization: "Giants Direct",
            title: "Technician",
            description: "Same work",
          }),
          item({
            id: "b",
            organization: "Giants Direct",
            title: "Technician",
            description: "Same work",
          }),
          item({
            id: "c",
            organization: "Giants Direct",
            title: "Technician",
            description: "Different work",
          }),
        ],
        new Date(2026, 8, 1),
      ).roles,
    ).toBe(2);
    expect(stats.cities).toBe(2);
    expect(stats.tenure).toBe("8y 5m");
    expect(stats.miles).toBeGreaterThan(60);
    expect(
      presentCareerHistoryStats(
        [
          item({
            id: "open-ended",
            isCurrent: false,
            startDate: "2010-01-01",
            endDate: "",
            locationLabel: "Dayton, OH",
          }),
        ],
        new Date(2026, 8, 1),
      ).tenure,
    ).toBe("");
    const overlapping = presentCareerHistoryStats(
      [
        item({
          id: "media",
          startDate: "2016-03-01",
          locationLabel: "Media, PA",
          locations: [
            { address: "Media, PA", latitude: 39.916, longitude: -75.388 },
          ],
        }),
        item({
          id: "allentown",
          organization: "Sharp",
          startDate: "2023-01-01",
          locationLabel: "Allentown, PA",
          locations: [
            {
              address: "Allentown, PA",
              latitude: 40.608,
              longitude: -75.49,
            },
          ],
        }),
      ],
      new Date(2026, 8, 1),
    );
    expect(overlapping.miles).toBe(0);
    expect(overlapping.tenure).toBe("10y 6m");
    expect(
      presentCareerHistoryStats(
        [
          item({
            id: "giants",
            organization: "Giants Direct",
            locationLabel: "67",
            locations: [
              {
                address: "235 N Reservoir St, Lancaster, PA 17602, USA",
                latitude: 40.04,
                longitude: -76.3,
              },
            ],
          }),
        ],
        new Date(2026, 8, 1),
      ).cities,
    ).toBe(1);
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
    expect(
      searchCareerHistory(
        [
          item({
            id: "giants",
            organization: "Giants Direct",
            locationLabel: "67",
            locations: [
              {
                address: "235 N Reservoir St, Lancaster, PA 17602, USA",
                latitude: 40.04,
                longitude: -76.3,
              },
            ],
          }),
        ],
        "lancaster",
      ).map((row) => row.id),
    ).toEqual(["giants"]);
    expect(
      searchCareerHistory(
        [
          item({
            id: "giants",
            organization: "Giants Direct",
            locationLabel: "67",
            locations: [
              {
                address: "235 N Reservoir St, Lancaster, PA 17602, USA",
                latitude: 40.04,
                longitude: -76.3,
              },
            ],
          }),
        ],
        "reservoir",
      ).map((row) => row.id),
    ).toEqual(["giants"]);
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
