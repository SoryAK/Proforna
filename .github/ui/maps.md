# Resumsify Job Map UI Patterns

Last updated: 2026-06-15

> Status: Partially codified — patterns added as they are built.

---

## Panel Settings
- Trigger: "Panel settings" item inside the `...` (MoreHorizontal) menu in the WorkHistoryPanel header.
- Pattern: **Centered `<Dialog>`** (`sm:max-w-md`, `gap-0 p-0 overflow-hidden`), not a corner popover.
- Header: `<DialogHeader className="px-4 pt-4 pb-3 border-b">` with `<DialogTitle className="text-sm">`.
- Body: `<div className="px-4 py-4 space-y-4 overflow-y-auto max-h-[65vh] scrollbar-thin">`.
- Display toggles: **3-column icon tile grid** (`grid grid-cols-3 gap-2`). Each tile: icon + label + On/Off state. Active tiles use feature-specific accent (`border-blue-500/40 bg-blue-500/10` for Career Path, `border-cyan-500/40` for Concurrent, `border-primary/40` for Timeline).
- Stat Slots: **2-column chip grid** per group (`grid grid-cols-2 gap-1`). Selected chip: `bg-primary/10 text-primary border-primary/30`. Shows `#N` slot order when selected.

## Action Bar (Work Mapping mode)
- Location: below the resize handle, visible only when `showWorkHistory` is true.
- Tool buttons: `size="sm" h-7 text-xs`. Toggle buttons use `variant={active ? "default" : "outline"}`.
- Map Style button: cycles Roadmap → Satellite → Hybrid → Roadmap. Shows current style as label. Active (`variant="default"`) on Satellite or Hybrid; outline on Roadmap (default).
- Tile styles: `"google-roadmap"` (default) | `"google-satellite"` | `"google-hybrid"`. OSM removed — was a duplicate of roadmap.

## Locked Mode (Dedicated Route Pattern)

- **Trigger:** When a route should always show one map mode with no mode-switching allowed.
- **Props:** `<JobMap initialMode="work-history" | "job-search" lockedMode={true} />`
- **Effect on JobMapGoogle:** `onToggleWorkHistory` receives `undefined` → mode-switcher overlay button is hidden (conditional: `{!lockedMode && <button ...>}`).
- **Effect on action bar in JobMap:** Work History toggle button is suppressed when `lockedMode=true`.
- **Wrapper components:**
  - `WorkHistoryMap` (`src/components/work-history-map.tsx`) → used by `/work-map` page
  - `JobSearchMap` (`src/components/job-search-map.tsx`) → used by `/job-search` page
- **Nav:** `constants.ts` "Work History" nav item now points to `/work-map` with `Map` icon.
- **ADR:** See ADR-0006 for view preset context.

## Career Event Pin (`/worklog/map`, JobMap event-pin path)

- **Color:** `#d946ef` (Tailwind `fuchsia-500`). The single canonical color for career-event markers anywhere in the app — `EventsMap`, `JobMapGoogle` event pins, `WorklogEventsView` "View on map" link icon, `WorklogMapView` FAB, place-mode banner. Don't fork to `pink-500` or `purple-500`.
- **Marker shape:** 26px round, white 2px border, camera emoji (📷) center. Built as a raw `<div>` content for `AdvancedMarkerElement.content`.
- **InfoWindow:** opens on `mouseenter` AND `click`, closes on `mouseleave`. Content built with local `escapeHtml` helper (don't import from job-map-google's god file — duplicate the 6-line helper).

## Click-to-Place Mode (Cycle C pattern)

- **Trigger:** floating FAB on a dedicated map page. The `/worklog/map` FAB is the canonical example.
- **FAB position:** `absolute bottom-5 right-24 z-30 h-12 w-12 rounded-full bg-fuchsia-500 text-white shadow-lg`. **Right offset MUST be `right-24`** to clear the global Open AI Chat button at `fixed bottom-6 right-6 z-40`. Any future map-page FAB inherits this offset.
- **Armed state:** parent flips a `placeMode` boolean to true. Map sets `draggableCursor: "crosshair"`. A top-center banner appears: `absolute top-3 left-1/2 -translate-x-1/2 z-10 ... bg-fuchsia-500/95 text-white shadow-lg`, copy "Click anywhere on the map to add a career event · Esc to cancel".
- **Esc cancels** via window-level `keydown` listener attached only while `placeMode === true`.
- **Click handler is single-shot** — fires `onPickCoords(lat, lng)` once, parent flips `placeMode` false. Cursor restored on cleanup OR after the click, whichever fires first (both paths are idempotent).
- **Reverse-geocode flow:** `importLibrary("geocoding")` from `@googlemaps/js-api-loader` v2 (NOT Places API, NOT the legacy `Loader` class). Failure is silent — the parent has already prefilled `defaultLocation` with `${lat.toFixed(5)}, ${lng.toFixed(5)}` BEFORE the geocoder kicks off, so the user never sees an empty field.
- **Recipe:** [docs/workflows/add-click-to-place-map-create.md](../../docs/workflows/add-click-to-place-map-create.md).

## Dedicated Map Page Layout (FullBleedShell child)

- **Page shell:** wrapped in `<FullBleedShell>` (h-full, NOT a flex parent — see `.github/ui/global.md` if it exists).
- **View root MUST be `h-full flex flex-col`.** NOT `flex-1 min-h-0` — collapses to 0 height inside FullBleedShell.
- **Empty state is an OVERLAY, not a render branch.** Parent: `pointer-events-none absolute inset-0 grid place-items-center z-20`. Inner card: `pointer-events-auto`. The map+FAB must always mount so the FAB stays reachable from the empty state.

## TODO (capture when first built)
- Map overlay panel anatomy (position, width, z-index, backdrop)
- Job pin / marker style (active vs inactive state)
- Polygon right-click context menu pattern (see ADR for right-click implementation notes)
- Preset hot-swap controls (see ADR 0006)
- Mobile map interaction pattern
