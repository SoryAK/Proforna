import { describe, expect, it } from "vitest";
import {
  careerFrame,
  careerMoments,
  careerSpan,
  nextCareerMoment,
  rolesStartedBy,
  type CareerTimelineRole,
} from "./career-timeline";

function role(patch: Partial<CareerTimelineRole> & Pick<CareerTimelineRole, "id" | "startDate">): CareerTimelineRole {
  return {
    title: "Technician",
    organization: patch.id,
    place: "",
    endDate: "",
    isCurrent: false,
    pinned: true,
    milestones: [],
    events: [],
    ...patch,
  };
}

const roles = [
  role({
    id: "school",
    organization: "County College",
    startDate: "2018-08-01",
    endDate: "2020-12-01",
    pinned: false,
  }),
  role({
    id: "sharp",
    organization: "Sharp",
    startDate: "2023-01-01",
    isCurrent: true,
    milestones: [{ id: "promo", date: "2023-09-15", title: "Shift lead" }],
  }),
  role({
    id: "giants",
    organization: "Giants",
    startDate: "2024-06-01",
    isCurrent: true,
    events: [{ id: "install", date: "2025-02-01", title: "Line install" }],
  }),
];

describe("career timeline", () => {
  const moments = careerMoments(roles);

  it("builds dated starts, milestones, and events", () => {
    expect(moments.map((moment) => [moment.at, moment.kind, moment.roleId])).toEqual([
      ["2018-08", "started", "school"],
      ["2023-01", "started", "sharp"],
      ["2023-09", "milestone", "sharp"],
      ["2024-06", "started", "giants"],
      ["2025-02", "event", "giants"],
    ]);
  });

  it("skips a moment that has no month", () => {
    expect(
      careerMoments([
        role({
          id: "open",
          startDate: "",
          events: [{ id: "blank", date: "", title: "Untitled visit" }],
        }),
      ]),
    ).toEqual([]);
  });

  it("keeps an unpinned role on the frame", () => {
    const frame = careerFrame(roles, moments, "2019-01");
    expect(frame.tone).toBe("underway");
    expect(frame.lead?.id).toBe("school");
    expect(frame.lead?.pinned).toBe(false);
    expect(rolesStartedBy(roles, "2019-01").map((item) => item.id)).toEqual(["school"]);
  });

  it("names the other open role when two jobs overlap", () => {
    const frame = careerFrame(roles, moments, "2026-09");
    expect(frame.tone).toBe("underway");
    expect(frame.lead?.id).toBe("giants");
    expect(frame.alsoOpen.map((item) => item.id)).toEqual(["sharp"]);
  });

  it("lands on the milestone month and the gap between roles", () => {
    expect(careerFrame(roles, moments, "2023-09").moment?.title).toBe("Shift lead");
    expect(careerFrame(roles, moments, "2022-01").tone).toBe("between");
  });

  it("plays forward to the next dated moment", () => {
    expect(nextCareerMoment(moments, "2023-02")?.at).toBe("2023-09");
    expect(nextCareerMoment(moments, "2026-09")).toBeNull();
    expect(careerSpan(roles, moments, "2026-09")[0]).toBe("2018-08");
    expect(careerSpan(roles, moments, "2026-09").at(-1)).toBe("2026-09");
  });

  it("plays a dated residence and leaves an undated home off the playhead", () => {
    const homes = [
      {
        id: "clifton",
        label: "Clifton",
        address: "67 E Broadway Ave",
        startDate: "2016-04-01",
        endDate: "2019-06-01",
        pinned: true,
      },
      {
        id: "lancaster",
        label: "Lancaster",
        address: "235 N Reservoir St",
        startDate: "2019-07",
        endDate: null,
        pinned: true,
      },
      {
        id: "undated",
        label: "Now",
        address: "Somewhere",
        startDate: null,
        endDate: null,
        pinned: true,
      },
    ];
    const withHomes = careerMoments(roles, homes);
    expect(withHomes.map((moment) => [moment.at, moment.kind, moment.title])).toEqual([
      ["2016-04", "moved", "Clifton"],
      ["2018-08", "started", "Started"],
      ["2019-07", "moved", "Lancaster"],
      ["2023-01", "started", "Started"],
      ["2023-09", "milestone", "Shift lead"],
      ["2024-06", "started", "Started"],
      ["2025-02", "event", "Line install"],
    ]);

    const beforeWork = careerFrame(roles, withHomes, "2016-04", homes);
    expect(beforeWork.moment?.kind).toBe("moved");
    expect(beforeWork.home?.id).toBe("clifton");
    expect(beforeWork.lead).toBeNull();

    const atSchool = careerFrame(roles, withHomes, "2019-01", homes);
    expect(atSchool.lead?.id).toBe("school");
    expect(atSchool.home?.id).toBe("clifton");

    const afterMove = careerFrame(roles, withHomes, "2019-08", homes);
    expect(afterMove.home?.id).toBe("lancaster");
    expect(afterMove.moment).toBeNull();

    expect(nextCareerMoment(withHomes, "2016-05")?.at).toBe("2018-08");
    expect(nextCareerMoment(withHomes, "2019-06")?.at).toBe("2019-07");
    expect(careerSpan(roles, withHomes, "2026-09")[0]).toBe("2016-04");
  });
});