import { describe, expect, it } from "vitest";
import {
  resolveEventCoords,
  type CoordResolverEvent,
  type JobCoord,
} from "./resolve-event-coords";

const baseEvent: CoordResolverEvent = {
  id: "evt_1",
  workHistoryId: null,
  lat: null,
  lng: null,
};

describe("resolveEventCoords", () => {
  describe("free-floating events", () => {
    it("returns own coords with source=self when event has lat/lng", () => {
      const result = resolveEventCoords(
        { ...baseEvent, lat: 40.7128, lng: -74.006 },
        new Map(),
      );

      expect(result).toEqual({
        lat: 40.7128,
        lng: -74.006,
        source: "self",
      });
    });

    it("returns null when event has no lat/lng and no workHistoryId", () => {
      const result = resolveEventCoords(baseEvent, new Map());

      expect(result).toBeNull();
    });

    it("returns null when lat is NaN", () => {
      const result = resolveEventCoords(
        { ...baseEvent, lat: NaN, lng: -74.006 },
        new Map(),
      );

      expect(result).toBeNull();
    });

    it("returns null when lng is NaN", () => {
      const result = resolveEventCoords(
        { ...baseEvent, lat: 40.7128, lng: NaN },
        new Map(),
      );

      expect(result).toBeNull();
    });
  });

  describe("anchored events", () => {
    const jobCoordsById = new Map<string, JobCoord>([
      ["job_1", { lat: 41.8781, lng: -87.6298, company: "Barry Callebaut" }],
    ]);

    it("falls back to the linked job's coords when event has no own lat/lng", () => {
      const result = resolveEventCoords(
        { ...baseEvent, workHistoryId: "job_1" },
        jobCoordsById,
      );

      expect(result).toEqual({
        lat: 41.8781,
        lng: -87.6298,
        source: "anchored",
        anchoredCompany: "Barry Callebaut",
      });
    });

    it("prefers own coords over the parent's when both are present", () => {
      // Defensive — anchored events SHOULD have null lat/lng by API contract,
      // but if a row drifts (e.g. legacy/test data), self wins.
      const result = resolveEventCoords(
        { ...baseEvent, workHistoryId: "job_1", lat: 40.7128, lng: -74.006 },
        jobCoordsById,
      );

      expect(result).toEqual({
        lat: 40.7128,
        lng: -74.006,
        source: "self",
      });
    });

    it("returns null when workHistoryId is not in the map (orphan anchor)", () => {
      const result = resolveEventCoords(
        { ...baseEvent, workHistoryId: "job_ghost" },
        jobCoordsById,
      );

      expect(result).toBeNull();
    });

    it("returns null when the map is empty (jobs not yet loaded)", () => {
      const result = resolveEventCoords(
        { ...baseEvent, workHistoryId: "job_1" },
        new Map(),
      );

      expect(result).toBeNull();
    });
  });
});
