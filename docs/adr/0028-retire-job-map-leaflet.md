# Retire the Leaflet renderer; Google Maps is the sole map renderer

- **Status:** Accepted
- **Date:** 2026-06-15
- **Deciders:** Sory Kaba
- **Tags:** frontend, cleanup, map

## Context and Problem Statement

`job-map.tsx` historically supported two interchangeable map renderers via a
dynamic import: a Leaflet renderer (`job-map-leaflet.tsx`) and a Google Maps
renderer (`job-map-google.tsx`). Per ADR-0005 we standardized on
`@googlemaps/js-api-loader` v2 and effectively retired Leaflet in production
some time ago — the dynamic import was repointed at `job-map-google` but the
local variable was left named `LeafletMap`, the Leaflet component was left in
place, and the Leaflet npm dependencies stayed in `package.json`.

Today's audit (Day 4 of ADR-0027) revealed:

- `src/components/job-map-leaflet.tsx` has **zero callers** anywhere in `src/`.
- `src/types/leaflet-heat.d.ts` exists only to support `leaflet.heat` inside
  that one dead file.
- 6 packages (`leaflet`, `leaflet.heat`, `react-leaflet`,
  `react-leaflet-cluster`, `@types/leaflet`, `@types/leaflet.heat`) sit in
  `package.json` solely to satisfy that dead file.
- The dynamic-import alias `const LeafletMap = dynamic(() =>
  import("@/components/job-map-google"))` was actively misleading future
  readers about which renderer was live.
- Several docs (ADR-0006 z-index notes, `.features/job-search/job-search.md`,
  the Day 4 plan inside ADR-0027) described Leaflet as if it were still live.

Cycle A of ADR-0027 Day 4 added event-marker display parity to
`job-map-leaflet.tsx` on the false assumption that the file was a live
parallel renderer. That work is therefore inert and is removed by this ADR.

## Decision Drivers

- Honest naming — the runtime alias must match what it imports.
- Reduce maintenance surface — fewer deps, fewer "phantom" parallel
  implementations to keep in sync.
- Smaller install + faster typecheck.
- Prevent future contributors (or future agents) from wasting cycles on
  parity work in dead code.

## Considered Options

- **Option A** — Delete `job-map-leaflet.tsx`, drop the 6 deps, rename the
  alias to `MapRenderer`, amend related docs.
- **Option B** — Keep the file as a "parked future alternative renderer",
  but rename the alias and amend docs.
- **Option C** — Keep everything as-is and only fix docs.

## Decision Outcome

**Chosen option: "Option A"**, because the file has been dormant since
ADR-0005, has accumulated zero callers, and any future second-renderer
experiment would be better-served by a fresh implementation against the
current `JobMap` prop surface than by reviving a stale snapshot.

### Positive Consequences

- One renderer, one mental model. The map area in `job-map.tsx` is now
  unambiguous.
- 6 fewer production deps; smaller `node_modules`, faster `npm install`,
  one less attack surface to track.
- `LeafletMap` alias renamed to `MapRenderer` — the variable name now tells
  the truth.
- Day 4 of ADR-0027 simplifies: no parallel renderer, no parity to maintain.
  Cycle B (`/worklog/map`) and Cycle C (FAB + click-to-place) are
  Google-only.

### Negative Consequences

- If we ever want to ship an OSS-tile (license-free) discovery map, we'll
  need to rebuild the Leaflet path from scratch rather than reviving the
  retired file. Acceptable — the retired file was already two API surfaces
  behind the current `JobMap`.
- Two prior ADRs (ADR-0006, ADR-0027) reference "Leaflet" as a live concept.
  Per the immutable-ADR rule we do not edit them; this ADR is the
  authoritative record that Leaflet is gone.

## Pros and Cons of the Options

### Option A — Delete and rename

- ✅ Removes truly dead code.
- ✅ Honest naming.
- ✅ Fewer deps.
- ❌ Loses the (stale) Leaflet snapshot if we ever want to A/B again.

### Option B — Keep as parked alternative, rename alias

- ✅ Preserves the snapshot.
- ❌ The snapshot is already out of date with the current `JobMap` prop
  surface; "parking" it just delays the same delete.
- ❌ Keeps 6 deps live for nothing.

### Option C — Doc-only fix

- ✅ Zero risk.
- ❌ Leaves the lie in the codebase (`LeafletMap` alias, dead file, dead
  deps). Future readers will be misled again.

## Implementation

Single focused commit:

1. `git rm src/components/job-map-leaflet.tsx`
2. `git rm src/types/leaflet-heat.d.ts`
3. Rename `LeafletMap` → `MapRenderer` in `src/components/job-map.tsx`
   (one decl, one JSX usage).
4. Fix the misleading comment in `src/components/job-map-google.tsx`
   (`/* Types (same as leaflet version) */` → `(sole renderer — Leaflet
   retired per ADR-0028)`).
5. Strip 6 entries from `package.json`; refresh lockfile via `npm install`.
6. Update `.features/job-search/job-search.md` to list `job-map-google.tsx`
   and describe the discovery map as Google Maps.

## Follow-ups

- ADR-0027 Day 4 Cycle B (`/worklog/map`) and Cycle C (FAB + click-to-place)
  proceed as Google-only.
- Cycle A of ADR-0027 Day 4 (commit `70ad0fc`) added an event-marker block
  to the now-deleted Leaflet file. That code is removed implicitly by the
  file deletion in this ADR.
