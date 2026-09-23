import { describe, expect, it } from "vitest";
import {
  prepareResidence,
  residenceForMap,
  residencesToClose,
  type Residence,
} from "./residence";

const home = (patch: Partial<Residence>): Residence => ({
  id: "home",
  occupantId: "local",
  label: "Home",
  address: "1 Main St",
  latitude: 1,
  longitude: 2,
  startDate: "2020-01",
  endDate: null,
  ...patch,
});

describe("prepareResidence", () => {
  it("keeps a labeled home with a start month", () => {
    expect(
      prepareResidence({
        label: " Clifton apartment ",
        address: " 67 E Broadway Ave ",
        latitude: "39.92",
        longitude: -75.3,
        startDate: "2024-06-01",
      }),
    ).toEqual({
      ok: true,
      value: {
        label: "Clifton apartment",
        address: "67 E Broadway Ave",
        latitude: 39.92,
        longitude: -75.3,
        startDate: "2024-06",
        endDate: null,
      },
    });
  });

  it("keeps a home when the address has not been placed yet", () => {
    expect(
      prepareResidence({
        label: "Dorm",
        address: "Chester, PA",
        startDate: "2018-08",
        endDate: "2020-12",
      }),
    ).toMatchObject({
      ok: true,
      value: { latitude: null, longitude: null },
    });
  });

  it("rejects an end month before the start", () => {
    expect(
      prepareResidence({
        label: "Dorm",
        address: "Chester, PA",
        latitude: 1,
        longitude: 2,
        startDate: "2022-09",
        endDate: "2022-01",
      }),
    ).toEqual({ ok: false, error: "dates-invalid" });
  });
});

describe("residence history on the map", () => {
  const earlier = home({
    id: "earlier",
    label: "Dorm",
    startDate: "2018-08",
    endDate: "2020-12",
  });
  const current = home({
    id: "current",
    label: "Clifton",
    startDate: "2024-06",
    endDate: null,
  });

  it("uses the open home when no role is selected", () => {
    expect(residenceForMap([earlier, current], null)?.id).toBe("current");
  });

  it("uses the home that overlaps the selected role", () => {
    expect(
      residenceForMap([earlier, current], {
        startDate: "2018-08-01",
        endDate: "2020-12-01",
        isCurrent: false,
      })?.id,
    ).toBe("earlier");
  });

  it("lets a dated home replace an undated current home during that role", () => {
    const undated = home({ id: "now", startDate: null, endDate: null });
    expect(
      residenceForMap([undated, earlier], {
        startDate: "2018-08",
        endDate: "2020-12",
        isCurrent: false,
      })?.id,
    ).toBe("earlier");
    expect(
      residenceForMap([undated, earlier], {
        startDate: "2024-06",
        endDate: "",
        isCurrent: true,
      })?.id,
    ).toBe("now");
  });

  it("hides the house when no home covers that role", () => {
    expect(
      residenceForMap([current], {
        startDate: "2010-01",
        endDate: "2011-01",
        isCurrent: false,
      }),
    ).toBeNull();
  });

  it("closes the previous open home when a new one begins", () => {
    expect(
      residencesToClose([current], { id: "next", startDate: "2026-01" }, "2026-01"),
    ).toEqual([{ id: "current", endDate: "2026-01" }]);
  });
});
