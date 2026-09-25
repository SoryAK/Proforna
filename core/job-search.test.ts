import { describe, expect, it } from "vitest";
import {
  mappableJobListings,
  prepareJobSearchQuery,
  presentJobListings,
  searchRadiusFrame,
  searchRadiusMiles,
} from "./job-search";

describe("job search", () => {
  it("requires a role or a place", () => {
    expect(prepareJobSearchQuery({ q: "  ", where: "" }).ok).toBe(false);
    expect(prepareJobSearchQuery({ q: "electrician", where: "Clifton Heights" })).toEqual({
      ok: true,
      value: { q: "electrician", where: "Clifton Heights", distance: "25" },
    });
  });

  it("offers the same search radii as a place search, and frames that ring", () => {
    expect(searchRadiusMiles("50")).toBe(50);
    expect(searchRadiusMiles("15")).toBe(25);
    const frame = searchRadiusFrame({ latitude: 40, longitude: -75, miles: 69 });
    expect(frame[0]?.latitude).toBeCloseTo(41, 5);
    expect(frame[1]?.latitude).toBeCloseTo(39, 5);
    expect(frame[2]?.longitude).toBeGreaterThan(-75);
    expect(frame[3]?.longitude).toBeLessThan(-75);
  });

  it("turns a listings payload into map-ready roles and keeps the rest in the list", () => {
    const listings = presentJobListings(
      [
        {
          id: "2",
          title: "Warehouse associate",
          company: { display_name: "Acme" },
          location: { display_name: "Philadelphia, PA" },
          latitude: 39.95,
          longitude: -75.16,
          redirect_url: "https://example.test/warehouse",
          description: "<p>Night shift</p>",
        },
        {
          id: "1",
          title: "Lead electrician",
          company: { display_name: "Northstar" },
          location: { display_name: "Clifton Heights, PA" },
          latitude: 39.92,
          longitude: -75.3,
          redirect_url: "https://example.test/lead",
          description: "<p>Commercial fit-out</p>",
        },
        {
          title: "Remote coordinator",
          organization: "Harbor",
          location: "United States",
          url: "https://example.test/remote",
          description: "No site yet",
        },
        { title: "", company: { display_name: "Skip" } },
      ],
      "electrician",
    );

    expect(listings.map((listing) => listing.title)).toEqual([
      "Lead electrician",
      "Warehouse associate",
      "Remote coordinator",
    ]);
    expect(listings[0]).toMatchObject({
      id: "1",
      organization: "Northstar",
      location: "Clifton Heights, PA",
      url: "https://example.test/lead",
      summary: "Commercial fit-out",
    });
    expect(mappableJobListings(listings)).toHaveLength(2);
  });
});
