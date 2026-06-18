# ADR-0033 — Event creation no longer detours through the map

- **Status:** Accepted
- **Date:** 2026-06-18
- **Deciders:** Sory + Copilot
- **Tags:** frontend, ux, worklog, events

## Context and Problem Statement

Under ADR-0027 (Day 4 Cycle C), the only way to create a free-floating
`CareerEvent` was through `/worklog/map?place=1`: enter place-mode → click a
spot on the map → reverse-geocode → `EventCreateDialog` opens with the pin
already confirmed. The validator hard-required `lat + lng + location`, so the
map detour was the only way to satisfy it.

ADR-0032 added an inline `+ Event` button to the worklog rail (sidebar Events
row + procedures row), but it still routed to `/worklog/map?place=1`, which
preserved all the friction the user originally complained about:

> "I dont like that the maps pops up when the user when the user wants to
> create a event. the location should be a field much like the tools for the
> procedures."

> "The note should popup firt where the user can put the details of the event
> or circumstances then in the location feild they enter an address much like
> google maps and maybe a mini map pops up for them to confirm the location
> visually. I want their to be an option to defualt to the job location incase
> the event or circumstances happend at the office."

Two reasons the map-first flow was wrong:

1. **Capture is interrupted.** The user opens the rail to record something,
   but the first thing they see is a map asking them to fish for coordinates
   they don't yet care about. Title and details — the meaningful parts —
   come last, after a UI detour.
2. **"At the office" is the most common case.** Users already have their job
   locations on file (`WorkHistory`). The current map flow forces them to
   re-pick coordinates that the system already knows. Cognitive friction with
   no payoff.

The validator was already friendly to a non-map path: when `workHistoryId !==
null`, it exempts `lat/lng/location` and trusts the linked `WorkHistory`'s
geo (`/api/work-history/:id/events` POST handler enforces this). So the
backend never required the map detour — only the dialog did.

## Decision Drivers

- Match the user's stated mental model (note details first, then location-
  as-field).
- Make "at the office" a one-tap shortcut, not a coordinate dance.
- Keep visual confirmation of the chosen location (mini-map preview) so the
  geographic intent is preserved.
- Don't break `/worklog/map`'s pin-then-create FAB flow — it's still useful
  when capturing a moment "wherever you happen to be standing."
- Avoid widening the API. ADR-0027 Q2=B kept `/api/events` strictly free-
  floating with `workHistoryId: null` forced server-side; the dialog should
  dispatch to the right endpoint instead of weakening that contract.

## Considered Options

- **Option A — Dialog-first, location-as-field with chip row + Places
  autocomplete + mini-map (the "address-bar" pattern).** Rail `+` opens the
  dialog directly. The dialog has Title / What happened / Category / Dates,
  then a "Where?" section with (1) a chip row of saved jobs that resolves to
  anchored mode, (2) a Places autocomplete that resolves to free-floating
  mode, (3) a 240×140 read-only mini-map showing the resolved coords.
- **Option B — Always require Places autocomplete, no chip shortcut.** One
  field for everyone. Simpler but ignores the "default to job" user request.
- **Option C — Replace the dialog entirely with an inline composer.** The
  user could type freely and we'd extract structured fields with AI. Heavy;
  out of scope for this round.

## Decision Outcome

**Chosen option: "Option A — Dialog-first with chip row + autocomplete +
mini-map."**

This matches the user's stated UX directly, makes the validator's existing
anchored-vs-free-floating split visible to the user as a chip-vs-address
choice, and adds visual confirmation without adding a separate map view.

### Architecture

- `PlacesAutocomplete` extended with an optional `onCoordsResolved` callback
  that fires async after a `PlacesService.getDetails` lookup. Existing
  callers (`life-anchors-panel`, `job-map`) ignore the new callback —
  backward compatible.
- `EventCreateDialog` props `coords` and `defaultLocation` made optional. The
  dialog now branches at submit time:
  - `selectedJobId` set → `POST /api/work-history/:id/events` (anchored).
  - `addressText + addressCoords` set → `POST /api/events` (free-floating).
- A small inline `MiniMapPreview` component lazy-mounts a Google Map only
  after the user has picked a location. Disabled controls, single marker,
  140px tall — confirmation, not navigation.
- Sidebar `+ Event` action flips local `useState(eventDialogOpen)` instead
  of routing to `/worklog/map?place=1`. The `<EventCreateDialog>` is rendered
  at the nav root.
- `/worklog/map` FAB path is unchanged — it still passes `coords` +
  `defaultLocation`, which now puts the dialog in pre-filled address mode.

### Positive Consequences

- Note-details-first capture matches user intent.
- "At the office" becomes a one-tap chip click that uses the saved job's
  coordinates.
- Empty-WorkHistory users (brand new accounts) gracefully fall back to
  address-only — the chip row hides itself.
- Map FAB still works for "I'm somewhere new and want to drop a pin"
  workflows. No regression for ADR-0027 Day 4 muscle memory.
- Backend contract preserved — both `/api/events` and
  `/api/work-history/:id/events` keep their original guarantees and tests.

### Negative Consequences

- Anchored events created through the chip row have no `lat/lng` of their own,
  so they don't render on `/worklog/map` (the map only shows points with
  geo). Acceptable for v1 — they live on `/worklog/events` list. Future:
  the map could fall back to the job's geo for anchored events.
- The Places `getDetails` call adds ~200–400ms latency between selecting a
  suggestion and the mini-map appearing. Mitigated with a "Looking up
  location…" placeholder; submit blocks until coords resolve.
- Two endpoints (anchored vs. free-floating) → two code paths in the dialog.
  The conditional is small (one `if (selectedJobId)`), but invisible to the
  user. Worth the architectural cost vs. weakening ADR-0027 Q2=B.
- Mounts a fresh `google.maps.Map` per preview. Cheap relative to typing
  speed but not free; lazy-mount is the only mitigation.

## Pros and Cons of the Options

### Option A — Chip row + autocomplete + mini-map (chosen)

- ✅ Matches user-stated UX one-to-one (details first, location as field,
  default-to-office shortcut, mini-map confirmation).
- ✅ Reuses existing validator contract (anchored vs. free-floating).
- ✅ No backend change — both endpoints already exist.
- ✅ Backwards compatible with the map FAB.
- ❌ Two code paths in the dialog (anchored POST vs. free-floating POST).
- ❌ Anchored events have no own geo → won't appear on `/worklog/map` until
  a future iteration teaches the map to fall back to job coords.

### Option B — Single Places autocomplete, no chip row

- ✅ Simpler dialog, one code path.
- ❌ "At the office" forces re-typing the office address every time.
- ❌ Ignores the user's explicit "default to job location" request.

### Option C — AI-driven inline composer

- ✅ Lowest friction in the abstract.
- ❌ Inferring structured fields from free text is a separate, bigger ADR.
- ❌ Doesn't answer "what coords should we save" without a fallback flow.
- ❌ Out of scope for the immediate UX complaint.

## Non-Goals

- Anchored events on `/worklog/map`. Could be added later with a
  "borrow-job-geo" fallback; deliberately deferred.
- Unified single field that auto-detects "looks like a saved job" vs.
  "looks like an address." Tested it in design — the chip row is faster
  to scan than autocomplete results that only sometimes include jobs.
- A full pan-and-zoom mini-map. Confirmation only — gestures disabled.

## Supersedes

- ADR-0027 Day 4 Cycle C scope of "free-floating only, map detour
  required" for the dialog. The dialog is no longer free-floating-only.

## Links / References

- ADR-0005 — `@googlemaps/js-api-loader` v2 (used for `importLibrary`)
- ADR-0027 — Worklog Events (validator contract, two endpoints)
- ADR-0032 — Rail inline `+` affordances (this is the second half of the
  same UX story — rail entry point now opens a real surface, not a map
  detour)
- `src/components/places-autocomplete.tsx` — `onCoordsResolved` callback
- `src/components/worklog/events/event-create-dialog.tsx` — dialog refactor
- `src/components/worklog/worklog-nav-sidebar.tsx` — sidebar `+` rewire
- `src/components/worklog/worklog-map-view.tsx` — FAB callsite (unchanged)
