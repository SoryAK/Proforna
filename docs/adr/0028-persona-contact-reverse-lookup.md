# Persona / Contact Reverse-Lookup + Discoverability

- **Status:** Accepted (2026-06-15)
- **Date:** 2026-06-15
- **Deciders:** Sory
- **Tags:** worklog, contacts, schema, knowledge-graph, discoverability
- **Related:** [ADR-0012](./0012-asset-library-knowledge-backbone.md), [ADR-0015](./0015-worklog-notes-document-manager.md), [ADR-0016](./0016-note-to-note-linking-and-backlinks.md)

## Context and Problem Statement

The `@p:contact` mention prefix has been wired in the worklog editor since
ADR-0016 (note-to-note linking shipped). Users can already type `@p:` and
get a contact picker; the chip persists in `WorkLog.contentJson`. The
`Contact` model is fully realized in `prisma/schema.prisma` (name, email,
phone, company, role, linkedinUrl, relationship, notes, lastContactedAt)
and `/contacts` exposes a CRUD grid.

What is **missing** is the inverse: when the user opens a contact, there
is no way to see "which notes mention this person." The mention chip is a
write-only seam today. This ADR closes that gap with the smallest possible
change consistent with the shipped ADR-0016 pattern (`linkedNoteIds`).

## Decision Drivers

- **Pattern consistency** — ADR-0016 already established the shape for
  reverse-lookup of an entity referenced inline by a `@mention`:
  denormalized `WorkLog.<kind>Ids: String[]` column populated on save by
  `extractMentionEntityIds(doc, kind)`, GIN-indexed, queried via
  `findMany({ where: { <kind>Ids: { has: id } } })`. The fifth entity
  (worklog → note backlinks) ships exactly this way; the sixth
  (contact → note backlinks) should not invent a different shape.
- **Indexed lookup or nothing** — a non-indexed scan over every WorkLog's
  `contentJson` (Postgres `jsonb_path_query`) is acceptable for a
  weekend-scale dataset and unacceptable for a year of notes. We have a
  GIN-indexed precedent; use it.
- **Discoverability is part of the feature, not a follow-up** — the
  parked-ideas item explicitly named "most users won't discover `@p:`
  exists" as gap #3. Empty-state copy in the new surface must address it.
- **Scope discipline (ADHD)** — the parked-ideas item lists five gaps;
  shipping all of them in one sprint is the textbook drift pattern. v1
  closes gap #1 (reverse-lookup endpoint) + gap #2 partially (surface
  inside existing edit Dialog, not a new drawer) + gap #3 (empty-state
  hint). Gaps #4 (cross-cut to JobApplication / Interview /
  RecruiterSubmission), #5 (`@c:`-vs-`Contact.company` bridge), and the
  open question of auto-bumping `lastContactedAt` on mention stay parked
  with explicit re-entry triggers.

## The Griller — questions answered upfront

1. **REPLACE or ADDITIVE write semantic?**
   REPLACE — mirror `linkedNoteIds`. There is no "manual contact accordion"
   on a WorkLog today (no `Contact` UI on the note); the chip in
   `contentJson` IS the only link source. Removing the chip must remove
   the link, otherwise stale rows accumulate forever. ADR-0012's ADDITIVE
   semantic for `assetIds` exists *because* assets have a manual UI seam
   (the asset accordion). Contacts don't.
2. **What happens when a referenced contact is deleted?**
   Same as deleted assets / worklogs / skills: `MentionNodeView` already
   renders broken-chip styling; the backlinks query for the deleted
   contact id naturally returns nothing because no contact row matches
   the owner-scope guard. No history rewriting, no cascade on `WorkLog`.
   The denormalized `linkedContactIds` array can carry orphan ids until
   the chip is edited — same orphan tolerance as ADR-0016.
3. **Why surface inside the existing edit Dialog instead of a new drawer?**
   v1 ships in ~80 LOC; a standalone drawer is ~200 LOC + URL
   handshake + focus management + mobile sheet behavior. The lab evidence
   we need is "does anyone actually use reverse-lookup at all" — not
   "does the drawer chrome feel right." If the in-Dialog surface is
   misused (people opening Edit just to browse mentions), promote to a
   standalone `<ContactDetailDrawer>` in a follow-up ADR. Until then,
   adding chrome is over-engineering.

## Considered Options

### Option A — `WorkLog.linkedContactIds: String[]` + GIN index (mirror ADR-0016)

Add a sixth denormalized column to `WorkLog`. PUT route extends to
derive `linkedContactIds` from `extractMentionEntityIds(contentJson,
"contact")` with skip-if-equal guard via `arraysEqualAsSets`. New route
`GET /api/contacts/[id]/backlinks` returns
`{ id, label, date, positionId }[]` for owner-scoped notes whose
`linkedContactIds` contain the target. Owner-scope verifies the
contact id belongs to the user before querying.

### Option B — Polymorphic `WorkLogMention { workLogId, entityType, entityId }` join table

Refactor all five `@mention` types into a single normalized table.
Backlinks for any entity type become `findMany({ where: { entityType,
entityId } })`.

### Option C — Live `jsonb_path_query` scan at request time

No schema change. Each backlinks query scans every WorkLog's
`contentJson` for `mention` nodes with `entityType: "contact"` and the
target `entityId`. Either accept the linear scan or build a
function-based GIN index on the JSONB.

## Decision Outcome

**Chosen option: "Option A — `linkedContactIds` column"**, because it is
exactly the shape we shipped 8 days ago for `linkedNoteIds`. The
machinery (extractor, skip-if-equal helper, recipe, tests) all reuses
unchanged. Migration is a single additive `ALTER TABLE ... ADD COLUMN`
plus one `CREATE INDEX ... USING GIN` — same as the 2026-06-09
`linkedNoteIds` migration.

Option B is the right *long-term* shape (when 4-5 entity types all need
backlinks), but doing it now means refactoring three shipped extractor
callsites + the PUT route + ADR-0016's backlinks endpoint mid-sprint.
Classic "let's improve while we're here" drift. Park it with an explicit
trigger: when the third entity type (`@s:` skill or `@c:` company) needs
backlinks, that ADR's first task is to consolidate.

Option C is dead at the volume of a year of notes — no path forward.

### Positive Consequences

- Reverse-lookup for `@p:` ships with a 4-line Prisma query, indexed.
- Pattern consistency: anyone reading `linkedNoteIds` understands
  `linkedContactIds` immediately.
- The recipe `docs/workflows/wire-mention-entity-type.md` already
  describes 90% of the work; this is its first reuse.
- The empty-state copy ("Type `@p:` in any worklog note to mention
  them") closes the discoverability gap from the parked-ideas item.

### Negative Consequences

- One more denormalized column on `WorkLog`. When a third entity type
  needs backlinks, the consolidation refactor (Option B) gets bigger.
- `String[]` columns store no per-link metadata (paragraph position,
  surrounding context). If we later want backlink cards that show "…in
  the second paragraph of 'Foo'," we either revisit Option B or add
  per-link metadata as a separate normalized table.
- The contact-detail-drawer UX question (gap #2 from the parked-ideas
  item) is partially deferred; v1 ships the data path, the chrome
  question stays open.

## Pros and Cons of the Options

### Option A — `linkedContactIds` column

- ✅ One additive migration, one new column, one new GIN index.
- ✅ Reuses `extractMentionEntityIds`, `arraysEqualAsSets`,
  `deriveWorklogLabel`, the entire recipe.
- ✅ Indexed reverse-lookup is O(log n) via the GIN.
- ✅ Migration is data-safe; backfill script is idempotent and runs once.
- ❌ Sixth `*Ids` column on `WorkLog`. Schema gets wider.
- ❌ Per-link metadata still impossible without Option B.

### Option B — Polymorphic mention join table

- ✅ Cleaner long-term shape; one table covers every entity type.
- ✅ Per-link metadata (paragraph position, etc.) becomes natural.
- ❌ Refactor scope, not feature scope. Touches every shipped extractor
  callsite + PUT route + ADR-0016 backlinks endpoint.
- ❌ Migration is non-trivial (new table + backfill from 5 columns).

### Option C — JSONB scan at query time

- ✅ Zero schema change.
- ❌ Linear scan over every WorkLog's `contentJson` per query. Dies at
  ~1k notes; current dev DB already has hundreds.
- ❌ Diverges from the indexed pattern shipped in ADR-0016. Two
  different reverse-lookup mental models for users to hold.

## Implementation Sketch

### Unit 1 — Schema + migration + backfill

1. Add `WorkLog.linkedContactIds String[] @default([])` +
   `@@index([linkedContactIds], type: Gin)` in
   [prisma/schema.prisma](prisma/schema.prisma).
2. `npx prisma migrate dev --name add_worklog_linked_contact_ids`.
3. New script
   [scripts/migrations/2026-06-15-backfill-linked-contact-ids.ts](scripts/migrations/2026-06-15-backfill-linked-contact-ids.ts)
   walks every `WorkLog.contentJson` and populates `linkedContactIds`
   from `extractMentionEntityIds(doc, "contact")`. Idempotent (re-run
   = no-op once converged). `--dry-run` flag supported.

### Unit 2 — PUT route hardening (TDD)

Extend [src/app/api/work-logs/[id]/route.ts](src/app/api/work-logs/%5Bid%5D/route.ts)
PUT to derive + skip-if-equal-write `linkedContactIds`. Three RED tests
in `route.test.ts`: chip add → column populated, chip remove → column
cleared, mention set unchanged → no column write.

### Unit 3 — Backlinks API (TDD)

New
[src/app/api/contacts/[id]/backlinks/route.ts](src/app/api/contacts/%5Bid%5D/backlinks/route.ts).
401 unauthenticated, 404 when contact id doesn't belong to the user
(*tighter than ADR-0016's worklog backlinks route — see "Out of scope"
below*), then `prisma.workLog.findMany({ where: { userId,
linkedContactIds: { has: contactId } }, select: ... })`. Response shape
mirrors ADR-0016's worklog backlinks: `{ id, label, date, positionId }[]`
via `deriveWorklogLabel`.

### Unit 4 — UI surface inside Edit Dialog

New `<ContactBacklinksSection contactId>` component — same shape as
`WorklogBacklinksPanel` (TanStack Query + clickable rows). Mounted in
the existing edit Dialog of
[src/app/(app)/contacts/page.tsx](src/app/(app)/contacts/page.tsx).
Click row → `router.push("/worklog/notes?focus=" + workLogId)` per
ADR-0015 contract. Empty state surfaces the discoverability hint.

### Unit 5 — Phase 4 wrap

ADR → Accepted, Manual entry, recipe rev 3, memory write
(`ContactDomain` if absent), handoff.

## Out of Scope (parked, with re-entry triggers)

- **Auto-bump `Contact.lastContactedAt` on mention save.** Open question
  flagged in parked-ideas. Needs its own micro-ADR; the right semantic
  isn't obvious (every save bumps it? every NEW chip? user-confirmed?).
- **Standalone `<ContactDetailDrawer>` (gap #2 promotion).** Ship v1
  inside the edit Dialog, watch for misuse; promote if the data shows
  users wanting to *browse* not *edit*.
- **Cross-cut to `JobApplication` / `Interview` / `RecruiterSubmission`
  contact mentions (gap #4).** Same pattern, same column shape — a
  follow-up sprint can extend the `linkedContactIds` query to those
  surfaces. Out of v1.
- **Bridge `@c:`-vs-`Contact.company` (gap #5).** Free-text `company`
  doesn't currently resolve to a `WorkHistory` row; reconciliation needs
  a fuzzy-match story that's its own ADR.
- **Toolbar hint / slash-command for `@p:` discoverability beyond
  empty-state copy.** Watch the metric (how often is the empty-state
  copy seen?) before adding more chrome.
- **Retroactive owner-scope tightening on
  `/api/work-logs/[id]/backlinks`.** ADR-0016's route doesn't pre-verify
  the target id belongs to the user (it scopes only the WorkLog query).
  The new contacts route adopts the tighter shape; we don't retroactively
  patch the worklog one this sprint (scope creep).

## Links / References

- [ADR-0012 — Asset Library knowledge backbone](./0012-asset-library-knowledge-backbone.md)
- [ADR-0015 — Worklog notes document manager](./0015-worklog-notes-document-manager.md)
- [ADR-0016 — Note-to-note linking + backlinks panel](./0016-note-to-note-linking-and-backlinks.md)
- Parked-ideas entry: `Persona/Contact reverse-lookup + better discoverability` (parked 2026-06-12).
