# 0027 — Worklog Events via `CareerEvent` extension

- **Status:** Accepted
- **Date:** 2026-06-14
- **Deciders:** Sory
- **Tags:** data, frontend, worklog, map, search

## Context and Problem Statement

The user wants to capture **events** — things that happened at a specific
place and time, with a date/range, lat/lng + label, photos, and a
free-form type — and have them:

1. Live alongside other worklog notes (search, archive, version history,
   mentions, folders all "just work").
2. Appear as **pins on a map**.
3. Be creatable from **two paths**: New Note → "Event" template, AND
   "+ New Event" on a map view (click-to-pin).

The earlier draft of this ADR proposed adding event fields onto `WorkLog`
via `category = "event"`. **That framing missed the existing `CareerEvent`
entity in the codebase** (`prisma/schema.prisma:2516`), which already
models the same shape:

| Capability | Where it already lives |
|---|---|
| `id`, `userId`, `title`, `description`, `category` (project / milestone / responsibility / training / outcome / context_shift) | `CareerEvent` |
| `startDate`, `endDate`, `location`, `lat`, `lng`, `metrics` | `CareerEvent` |
| Photos with focal/zoom/rotation/flip framing | `CareerEventPhoto` |
| Skills join (event ↔ resume) | `CareerEventSkill` |
| Worklog → event promotion | `WorkLog.promotedToCareerEventId` + `promote-to-event-dialog.tsx` |
| Map rendering | `JobMap` already wires `mappableEvents → eventMarkers` to `JobMapGoogle` |
| API CRUD | `src/app/api/work-history/[id]/events/route.ts` + `[eventId]/route.ts` |

The actual decision is therefore **not** "model events"; it is **"give the
existing `CareerEvent` model the worklog UX surfaces (rich body, search,
version history, folders, mentions) and unlock free-floating events that
aren't tied to a `WorkHistory`."** Anything else creates two parallel
event entities and corrupts the `promotedToCareerEventId` flow into
self-reference.

## Decision Drivers

- One source of truth for events. `promotedToCareerEventId` must keep
  meaning.
- Reuse existing worklog surfaces (search, archive, version history,
  folders, mentions, backlinks) without duplicating the data model.
- Avoid a parallel renderer for the map — Google ⇄ Leaflet parity must
  hold.
- One-week sprint budget. ADHD-friendly bounded scope; visible progress
  per day.
- Door open for richer event behavior (recurring, RSVP, calendar import)
  without re-migration.

## Considered Options

### Q1 — Where do events live?

- **A. Extend `CareerEvent`** — make `workHistoryId` nullable so events
  can be free-floating ("personal" events not tied to a job), add
  `contentJson Json?` for the rich-editor body, add a
  `searchVector tsvector` GENERATED STORED column (mirroring the
  `WorkLog` pattern at `prisma/schema.prisma:783`) so events join worklog
  search via UNION at query time. **Chosen.**
- **B. Discriminator on `WorkLog`** (the original draft's pick) —
  duplicates the entity; `promotedToCareerEventId` becomes
  self-referential; two write paths.
- **C. Keep both, document the seam** — UX confusion ("offsite is a
  worklog but my promotion is a CareerEvent"); worst-of-both maintenance.

### Q2 — Map integration

- **A. New layer on existing `JobMap`** ("My Career Events"), reuses
  every preset.
- **B. Dedicated separate map page** with a brand-new orchestrator and
  renderer.
- **C. Renderer-reuse, orchestrator-extend** — `eventMarkers` prop is
  already in `JobMapGoogle`; add Leaflet parity, add
  `JobMap.initialMode = "work-events"`, mount
  `<JobMap initialMode="work-events" lockedMode />` at `/worklog/map`.
  **Chosen.**

### Q3 — Event-type taxonomy

- **A. Fixed enum.**
- **B. Free-form `CareerEvent.category` string** with a chip-row of
  *widened* suggestions (existing CareerEvent values + worklog-flavored:
  conference / offsite / anniversary / interview / site-visit).
  **Chosen.**
- **C. Two separate vocabularies** (one per scope).

### Q4 — Search integration

- **a. UNION at query time** — the worklog search data-layer fans out to
  `WorkLog` and `CareerEvent`, each with its own `searchVector` + Gin
  index, and merges/ranks results in JS. **Chosen.**
- **b. Materialized view** projecting both into one tsvector. Cleanest
  at query, costliest to set up + maintain refresh logic.
- **c. Leave events out of v1 search.** Smallest scope; ships a known
  gap.

## Decision Outcome

**Chosen: Q1=A, Q2=C, Q3=B, Q4=a.**

- **Q1=A — Extend `CareerEvent`.** Single event entity; the existing
  promote-to-event dialog keeps meaning ("promote a casual worklog note
  into a structured CareerEvent for the IR"). `workHistoryId` becomes
  nullable so the user can create personal events (anniversary,
  conference unrelated to a job). `contentJson Json?` is added for
  rich-editor parity with `WorkLog`. Cost: a backfill-friendly migration
  + every existing `CareerEvent` query that joins `WorkHistory` must
  learn to handle null.
- **Q2=C — Renderer-reuse, orchestrator-extend.** `JobMapGoogle` already
  accepts `eventMarkers` (line 182). `JobMap` already passes
  `mappableEvents` (line 4401). Remaining work: add `eventMarkers`
  parity to `JobMapLeaflet`, add `"work-events"` to `JobMap.initialMode`
  union, mount at `/worklog/map`. Pin color = stable hash of
  `category.toLowerCase().trim()`.
- **Q3=B — Free-form category with widened suggestions.** Storage stays
  as the existing `CareerEvent.category String @default("project")`. The
  chip-row in the editor surfaces both vocabularies:
  `project / milestone / responsibility / training / outcome /
  context_shift / conference / offsite / anniversary / interview /
  site-visit`. No data migration — existing rows keep their values; new
  ones can pick from a wider menu or type free text.
- **Q4=a — UNION at query time.** Add `searchVector tsvector` GENERATED
  STORED column to `CareerEvent` (mirroring `WorkLog`'s pattern) plus a
  Gin index. The worklog search data-layer issues two queries
  (`WorkLog` + `CareerEvent`), merges in JS, returns a tagged
  discriminated union. Acceptable cost for current row counts;
  reroutable to a materialized view later if performance demands.

### Positive Consequences

- **No duplicate entity.** `promotedToCareerEventId` keeps its meaning.
  One read path; one write path; one map data source.
- **Existing API routes survive.** `/api/work-history/[id]/events/*`
  remains the work-history-scoped path; a new peer
  `/api/events/*` family handles the `workHistoryId === null` case (see
  Implementation outline). No greenfield CRUD for the common case.
- **Photos already framed.** `CareerEventPhoto` has focal/zoom/rotation/
  flip; the event template just mounts the existing photo panel UI.
- **Map already half-built** for Google. Leaflet parity is the only
  renderer work.
- **Search joins via shared shape.** Both tables expose a `tsvector` and
  can be UNIONed at the data layer.

### Negative Consequences

- **`workHistoryId` nullable migration** breaks any existing query that
  assumed it was non-null. Audit cost: small (referenced in
  `auto-log.ts`, `worklog-note-reader.tsx`, `promote-to-event-dialog.tsx`,
  the events API routes, the skill-graph route). Mitigation: a Phase 2.5
  TDD pass on each callsite before flipping the schema.
- **Search UNION at query time** is two table scans where one would do.
  Acceptable today (events table is small); revisit when the union path
  exceeds ~300ms or `CareerEvent` row count crosses ~10k.
- **`JobMap` keeps growing** (one more `initialMode` value, one more
  conditional). Same debt the original draft accepted; revisit splitting
  once `work-events` mode ships.
- **Free-form category fragmentation** — "offsite" vs "off-site" still
  don't share a color/icon by default. Lenient hash collapses common
  case differences; truly inconsistent strings are accepted as v1 cost.
- **`ADR-0017` (worklog version history)** does not currently cover
  `CareerEvent`. Out of scope here; if version history on events is
  desired, a follow-up ADR extends the snapshot shape. **Parked.**
- **`WorkLog`-only fields** — `tags`, `mood`, `folderId`, `linkedNoteIds`
  do not exist on `CareerEvent`. Events get a *subset* of worklog UX in
  v1. Adding any of these to events is incremental and gated by future
  ADRs, not blocking.

## Pros and Cons of the Options

### Q1 — Where do events live?

#### A. Extend `CareerEvent` **(chosen)**

- ✅ Single entity. `promotedToCareerEventId` retains meaning.
- ✅ All existing CRUD/UI/skill-join logic survives.
- ✅ Cheap forward path (recurring/RSVP/attendees land as additional
  cols later).
- ❌ `workHistoryId → String?` migration; every existing query must
  learn null.
- ❌ `WorkLog`-only fields (`tags`, `mood`, `folderId`,
  `linkedNoteIds`) absent — events get a subset of worklog UX in v1.

#### B. Discriminator on `WorkLog`

- ✅ Worklog UX (folders/mentions/mood) for free.
- ❌ Two parallel event entities. `promotedToCareerEventId` becomes
  self-referential.
- ❌ Six nullable cols on `WorkLog` mostly unused.
- ❌ Doubled write path; future refactor cost compounds.

#### C. Keep both, document the seam

- ✅ Smallest immediate change.
- ❌ User has to learn which-is-which. Will guess wrong every time.
- ❌ Two editors, two photo panels, two search paths.

### Q2 — Map integration

#### A. New layer on existing JobMap

- ✅ Cheap.
- ❌ Mixes "places I applied" with "things I went to" in one mental
  model.

#### B. Dedicated new orchestrator + renderer

- ✅ Clean separation.
- ❌ Doubles map maintenance surface; out of scope.

#### C. Renderer-reuse, orchestrator-extend **(chosen)**

- ✅ Matches the established `workHistoryMarkers` pattern.
- ✅ `JobMap.lockedMode` flag already exists; one new prop on Leaflet +
  one new `initialMode` value is the entire change.
- ❌ `JobMap` keeps getting bigger (accepted).

### Q3 — Event-type taxonomy

#### A. Fixed enum

- ✅ Drives icons + colors deterministically.
- ❌ Migration every time a value is added.

#### B. Free-form + widened suggestions **(chosen)**

- ✅ No schema change — `CareerEvent.category` is already a String.
- ✅ Lenient hash (`toLowerCase().trim()`) collapses common variants for
  color.
- ❌ Truly inconsistent strings still fragment.

#### C. Two vocabularies

- ❌ Cognitive overhead; users will mix them. Rejected.

### Q4 — Search integration

#### a. UNION at query time **(chosen)**

- ✅ Smallest set of moving parts (one tsvector column per table + a
  Gin index).
- ✅ Each table keeps its own search surface; existing worklog search is
  untouched.
- ❌ Two scans per search; ranking merge is JS-side.

#### b. Materialized view

- ✅ Single index, single rank.
- ❌ View migration + refresh-on-write logic + extra ops surface.
- ❌ Premature given current row counts.

#### c. Leave events out of v1 search

- ✅ Smallest scope.
- ❌ Ships a known gap; user will hit it the first day. Rejected.

## Implementation outline (1-week sprint, non-binding)

The binding pieces are above. This is sequencing.

- **Day 1 — Schema + manual validator (TDD per Phase 2.5).**
  Migration: `ALTER TABLE "CareerEvent" ALTER COLUMN "workHistoryId" DROP NOT NULL`;
  add `contentJson Json?`;
  add `searchVector tsvector` GENERATED STORED
  `(setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(location,'')), 'C'))`;
  Gin index on `searchVector`; partial index `(userId, startDate)
  WHERE startDate IS NOT NULL` for the map query path.
  Plain-TS validator in `src/lib/career-event/event-schema.ts`
  (mirroring the `worklog-categories.ts` / `worklog-folders.ts` house
  style — repo does not use zod): when `workHistoryId === null`, require
  `lat`, `lng`, AND `location`. Audit existing callsites that assume
  non-null `workHistoryId` (`auto-log.ts`, `promote-to-event-dialog.tsx`,
  the events API routes, the skill-graph route). RED-GREEN-REFACTOR per
  `testing.instructions.md`.

- **Day 2 — API routes for free-floating events.**
  Add a peer `/api/events/*` route family that accepts
  `workHistoryId === null` and delegates to the same data layer used by
  `/api/work-history/[id]/events/*`. Keeps the work-history-scoped
  route's invariants intact. Security-test per
  `security.instructions.md` (auth + ownership + manual validator from
  Day 1). Phase 2.5 TDD on the data layer (`src/data/career-event/*`).

- **Day 3 — "Event" template in the worklog New-Note picker.**
  Picker creates a `CareerEvent` (not a `WorkLog`) when the user picks
  "Event". Editor mounts a date-range picker, location field with "use
  map" affordance, free-form `category` field with the widened chip
  suggestions, and the rich `contentJson` body via the existing TipTap
  stack (ADR-0010). UI Graph Keeper records any new tokens touched.

- **Day 4 — Map renderer parity + `/worklog/map` route.**
  Add `eventMarkers?: CareerEventMarker[]` prop to `JobMapLeaflet`
  (Google parity). Add `"work-events"` to the `JobMap.initialMode`
  union. Pin click → popover with title, date(s), category, location,
  "Open note" link. New route at `/worklog/map` mounts
  `<JobMap initialMode="work-events" lockedMode />`. Floating
  "+ New Event" button → click-to-place pin → opens the event editor
  Dialog pre-filled with `lat` / `lng` / `locationLabel`.

- **Day 5 — Search UNION + photo gallery.**
  Worklog search data-layer fans out to both tables, merges by
  `ts_rank`, returns a tagged `SearchResult` discriminated union
  (`{ kind: "worklog" }` | `{ kind: "event" }`). Result-row UI gets a
  small affordance distinguishing the two. Mount the existing
  `CareerEventPhoto` panel into the event editor with the wider grid.
  Update Manual + Workflow Logger.

## Out of scope (parked)

- **Version history on events** — `ADR-0017` covers `WorkLog` only.
  A follow-up ADR can extend the snapshot shape to `CareerEvent` if
  desired.
- **Folder / mention / mood / tag parity for events** — `WorkLog` has
  `folderId`, `linkedNoteIds`, `mood`, `tags`. Events can adopt these
  one at a time as ADRs land; not blocking v1.
- **Backlinks-from-an-event surface** (Contact ↔ Event reverse-lookup)
  — bundled later with the persona reverse-lookup parked entry.
- **Calendar import** (Google / Microsoft Graph) — separate ADR; needs
  OAuth.
- **AI summaries / OCR on event photos** — gated on ADR-0021 / ADR-0022
  (parked AI provider router).
- **Recurring events / RSVP / multi-attendee** — future ADRs once the
  simple shape ships.

## Links / References

- ADR-0006 — job map preset hot-swap
- ADR-0010 — Tiptap editor (rich body for events reuses this stack)
- ADR-0011 — Postgres tsvector worklog search (UNION partner)
- ADR-0017 — worklog version history (event version history is parked)
- ADR-0026 — worklog archive bucket
- `prisma/schema.prisma:735` — `model WorkLog` with `searchVector`
  pattern this ADR mirrors
- `prisma/schema.prisma:2516` — `model CareerEvent` (the entity this
  ADR extends)
- `prisma/schema.prisma:2548` — `model CareerEventPhoto` (reused as-is)
- `src/components/job-map.tsx:4401` — existing `mappableEvents →
  eventMarkers` wire
- `src/components/job-map-google.tsx:182` —
  `eventMarkers?: CareerEventMarker[]` (Google done)
- `src/components/job-map-leaflet.tsx` — Leaflet renderer (parity work)
- `src/components/worklog/promote-to-event-dialog.tsx` — the existing
  promote flow whose meaning this ADR preserves
- `src/app/api/work-history/[id]/events/route.ts` +
  `src/app/api/work-history/[id]/events/[eventId]/route.ts` — existing
  CRUD; `workHistoryId === null` path is added as `/api/events/*`
