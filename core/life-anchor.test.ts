import { describe, expect, it } from "vitest";
import { lifeScore, prepareLifeAnchor } from "./life-anchor";

describe("life anchors", () => {
  it("keeps a named place with a weight", () => {
    const prepared = prepareLifeAnchor(
      {
        label: "Kids' school",
        icon: "school",
        address: "100 School Lane, Clifton Heights, PA",
        latitude: 39.92,
        longitude: -75.3,
        weight: 5,
      },
      "anchor-1",
      "occupant-1",
    );
    expect(prepared).toMatchObject({
      ok: true,
      value: { label: "Kids' school", icon: "school", weight: 5 },
    });
  });

  it("refuses a place that has no location", () => {
    expect(
      prepareLifeAnchor(
        { label: "Gym", address: "somewhere" },
        "anchor-1",
        "occupant-1",
      ).ok,
    ).toBe(false);
  });

  it("scores a role by weighted distance from the places that matter", () => {
    const home = { latitude: 39.93, longitude: -75.31, weight: 5 };
    const school = { latitude: 39.94, longitude: -75.28, weight: 1 };
    expect(lifeScore(home, [home, school])).toBeGreaterThan(
      lifeScore({ latitude: 40.6, longitude: -75.3 }, [home, school]) ?? 0,
    );
    expect(lifeScore(home, [])).toBeNull();
  });
});
