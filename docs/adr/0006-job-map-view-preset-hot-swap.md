# 0006 — Job-Map View-Preset Hot-Swap Pattern

- **Status:** Accepted
- **Date:** 2026-05-17
- **Deciders:** Sory Kaba
- **Tags:** frontend, ux, job-map, state

## Context and Problem Statement

The job-map page is the centerpiece of the app. Users wanted to access the **Work Log** and **Career Analytics** views without leaving the map context (and without losing map state — pan, zoom, drawings, filters).

Initial implementation embedded those views in a separate bottom panel under the map. User feedback rejected this: "it should do the opposite and change map window to the selected preset instead. Think of it like hot swapping." The map *itself* should be replaceable by another view, while map state stays alive in the background so switching back is instant.

A secondary issue: floating Leaflet controls (`z-[1050]` to `z-[1200]`) bled through any overlay placed at lower z-index.

## Decision Drivers

- Preserve Leaflet/map instance state across preset switches (no re-init cost)
- Single visual frame — no second panel taking screen real estate
- Each preset can have its own persistent UI tweaks (saved per preset)
- Embedded pages must visually adapt to the smaller frame (no giant page headers inside)

## Considered Options

- **Option A** — Hot-swap overlay: render Work Log / Analytics as an absolute-positioned overlay *inside* the map container, above Leaflet but below the preset switcher. Map stays mounted underneath.
- **Option B** — Route-based switching: navigate to `/worklog` / `/analytics`, lose map state
- **Option C** — Side-by-side split layout: map + embedded view share the frame
- **Option D** — Bottom panel embedding (initial attempt, rejected)

## Decision Outcome

**Chosen option: "Hot-swap overlay inside the map container"** at `z-[1300]` (above all Leaflet controls), with `viewPreset` state persisted to localStorage and per-preset tweaks (e.g. ratio) saved separately.

Embedded `WorklogPage` and `AnalyticsPage` accept a `compact` prop that hides their page-level title/subtitle and tightens padding to `p-3 space-y-3` — since the preset switcher already provides view context.

### Positive Consequences

- Map state is never destroyed when switching presets — instant return to map view
- One visual frame, no panel competition
- Compact mode lets the same components serve both the embed and the standalone `/worklog` and `/analytics` routes
- Preset tweaks persist per-preset (each remembers its own settings)

### Negative Consequences

- `job-map.tsx` grew larger (now hosts overlay + switcher + per-preset state on top of its existing complexity)
- Embedded pages must implement `compact` mode — coupling between map and otherwise independent pages
- Z-index ladder is now fragile: any new Leaflet control above `z-[1300]` will bleed through
- Page components receive a prop that the App Router doesn't pass — works because of default value, but Next.js page-typing discourages this (see [ADR 0002](./0002-nextjs-16-turbopack.md))

## Pros and Cons of the Options

### Option A — Overlay inside map container (chosen)

- ✅ Preserves map state across swaps
- ✅ Single frame, no panel competition
- ✅ Easy to extend with new presets
- ❌ Hard-coded z-index ladder
- ❌ Couples page components to a `compact` prop

### Option B — Route-based switching

- ✅ Clean URL semantics
- ✅ No prop coupling
- ❌ Map re-initializes on every return — slow, loses state
- ❌ User explicitly rejected losing map context

### Option C — Side-by-side split

- ✅ Both views visible at once
- ❌ Each view gets half the space — neither is comfortable
- ❌ Doesn't scale to more presets (3, 4, 5 views?)

### Option D — Bottom panel embedding

- ✅ Both visible
- ❌ User explicitly rejected this UX
- ❌ Doubles vertical scroll

## Links / References

- Commits: `998482b` (preset model + switcher), `016e872` (hot-swap), `920b0bb` (z-index fix), `ce6b0b1` (compact mode)
- Files:
  - `src/components/job-map/view-preset.ts` — preset model + localStorage helpers
  - `src/components/job-map/view-preset-switcher.tsx` — segmented switcher UI
  - `src/components/job-map.tsx` — overlay host
  - `src/components/worklog-page.tsx` — `compact` prop
  - `src/app/(app)/analytics/page.tsx` — `compact` prop
- Future: explored migrating this whole frame to be the home dashboard if it proves effective
