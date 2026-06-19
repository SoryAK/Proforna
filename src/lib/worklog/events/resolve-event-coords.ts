/**
 * Pure helper: resolves the coordinates a `CareerEvent` should be plotted at.
 *
 * Background — ADR-0027 introduced anchored vs free-floating events:
 *   - free-floating events carry their OWN `lat`/`lng`
 *   - anchored events have `workHistoryId` set and `lat`/`lng` = null
 *     (Q1=A immutability — they intentionally piggyback on the parent
 *     `WorkHistory` row's location, never own one)
 *
 * The map view previously dropped any event with null lat/lng, silently
 * hiding every anchored event. This resolver fixes that by falling back
 * to the linked job's coords when the event has none of its own.
 *
 * Pure & sync — the caller is responsible for fetching the job coord
 * map once and passing it in. Keeping this pure makes it trivial to
 * unit-test and re-use across map surfaces.
 */

export interface CoordResolverEvent {
  id: string;
  workHistoryId: string | null;
  lat: number | null;
  lng: number | null;
}

export interface JobCoord {
  lat: number;
  lng: number;
  company: string;
}

export type ResolvedCoord =
  | { lat: number; lng: number; source: "self" }
  | { lat: number; lng: number; source: "anchored"; anchoredCompany: string };

function isFiniteCoord(n: number | null): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function resolveEventCoords(
  event: CoordResolverEvent,
  jobCoordsById: ReadonlyMap<string, JobCoord>,
): ResolvedCoord | null {
  // Self wins when both coords are present and finite — even on anchored
  // events (defensive: legacy/test data may have drifted).
  if (isFiniteCoord(event.lat) && isFiniteCoord(event.lng)) {
    return { lat: event.lat, lng: event.lng, source: "self" };
  }

  // Anchored fallback: the linked WorkHistory must be in the map.
  if (event.workHistoryId) {
    const job = jobCoordsById.get(event.workHistoryId);
    if (job) {
      return {
        lat: job.lat,
        lng: job.lng,
        source: "anchored",
        anchoredCompany: job.company,
      };
    }
  }

  return null;
}
