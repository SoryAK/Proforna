import { describe, expect, it } from "vitest";
import { presentGoogleGeocode, readGoogleGeocode } from "./google-geocode";

describe("presentGoogleGeocode", () => {
  it("turns a Google address result into a work-map place", () => {
    expect(
      presentGoogleGeocode({
        status: "OK",
        results: [
          {
            formatted_address: "67 E Broadway Ave, Clifton Heights, PA 19018, USA",
            geometry: { location: { lat: 39.928845, lng: -75.2932877 } },
          },
        ],
      }),
    ).toEqual({
      label: "67 E Broadway Ave",
      address: "67 E Broadway Ave, Clifton Heights, PA 19018, USA",
      latitude: 39.928845,
      longitude: -75.2932877,
    });
  });

  it("returns nothing when Google has no address match", () => {
    expect(presentGoogleGeocode({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(presentGoogleGeocode({ status: "REQUEST_DENIED" })).toBeNull();
  });

  it("keeps the first few address matches and reports a denied key", () => {
    expect(
      readGoogleGeocode({
        status: "OK",
        results: [
          {
            formatted_address: "Springfield, IL, USA",
            geometry: { location: { lat: 39.78, lng: -89.65 } },
          },
          {
            formatted_address: "Springfield, MA, USA",
            geometry: { location: { lat: 42.1, lng: -72.58 } },
          },
        ],
      }).places.map((place) => place.address),
    ).toEqual(["Springfield, IL, USA", "Springfield, MA, USA"]);
    expect(readGoogleGeocode({ status: "REQUEST_DENIED" })).toEqual({
      places: [],
      denied: true,
    });
  });
});
