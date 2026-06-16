# Worklog Procedures (Runbooks)

- **Status:** Accepted (shipped 2026-06-15)
- **Date:** 2026-06-15
- **Deciders:** Sory
- **Tags:** worklog, procedures, runbooks, knowledge-graph, kind-discriminator
- **Related:** [ADR-0027](./0027-worklog-events.md) (kind-vs-separate-model precedent), [ADR-0028](./0028-persona-contact-reverse-lookup.md) (cross-cut backlinks recipe), [ADR-0017](./0017-worklog-version-history-and-visual-diff.md) (version history reused), [ADR-0016](./0016-note-to-note-linking-and-backlinks.md) (mention pattern reused)

## Context and Problem Statement

The user wants a place inside `/worklog` to capture **procedures** — written instructions for how to do something — and have them callable from a left-nav menu option. Examples:

- "How to PM-grease conveyor C-204"
- "How I run my weekly retro"
- "Lockout-tagout — Site B"

Procedures share traits with worklog notes (rich-text body, photos, mentions, version history, search), but differ in three ways:

1. **They are read repeatedly, not appended once.** A note is a journal entry; a procedure is a living document that the user re-reads while doing the work.
2. **They are referenceable from notes.** When a user logs "Did the conveyor PM today," they want to chip-link the procedure they followed.
3. **They optionally tie to an asset.** "How to PM-grease conveyor C-204" links to a `JobAsset`; "How I run my weekly retro" doesn't.

Today the user has no surface for any of this. Templates (`WorkLogTemplate`) are the closest neighbor but are *prefill specs* that produce a fresh `WorkLog` on use — the body of a template becomes the body of a new note when applied. That's the wrong shape for a document the user wants to keep referencing.

## Decision Drivers

- **Procedure is read many times, edited occasionally.** Versioning matters (which step changed and when?).
- **Procedures must be mentionable from notes.** Reverse-lookup ("which notes followed this procedure?") is a natural follow-on.
- **Optional asset link with 0..N cardinality.** Some procedures are asset-specific; some are workflow-only.
- **Reuse over reinvention.** Worklog already provides editor, autosave, version history, search, photos, archive, mentions, markdown export, folders, categories. A procedure that *is* a worklog inherits all of it for free.
- **Pattern-pivot economy.** ADR-0027 (Events) chose a separate `CareerEvent` model because events have ≥4 event-specific fields (location, datetime, end-time, geo). Procedures have **zero** procedure-specific fields beyond what `WorkLog` already supplies (`assetIds`, version history, archive). The cost-benefit flips compared to ADR-0027.

## Considered Options

| | **Option A: `WorkLog.kind: "procedure"`** | **Option B: Extend `WorkLogTemplate`** | **Option C: Standalone `Procedure` model** |
|---|---|---|---|
| Mental model | Procedure is a kind of worklog | Procedure is a kind of template | Procedure is its own thing |
| Optional asset link | Free — `WorkLog.assetIds` already GIN-indexed | Add `assetIds[]` to template | New column + index on new model |
| Rich Tiptap editor | ✅ free | 🟡 templates today don't mount full editor for body — bolt-on | ❌ reimplement mount + autosave + Y.js seam |
| Version history (ADR-0017) | ✅ free | ❌ reimplement | ❌ reimplement |
| Mentions (ADR-0016) — `@r:` | ✅ free, slots into rev-3 recipe | ❌ templates aren't mentionable | ❌ reimplement |
| "Procedures for this asset" reverse lookup | ✅ ADR-0028 cross-cut recipe applies as-is (~30 LOC) | 🟡 doable, new query path | 🟡 doable, new query path |
| Search (ADR-0011 tsvector) | ✅ free | ❌ templates aren't in tsvector | ❌ reimplement |
| Archive (ADR-0026) | ✅ free | ❌ reimplement | ❌ reimplement |
| Pollutes "All notes" view | 🟡 yes, unless filtered by `kind="note"` (default) | ✅ no | ✅ no |
| `kind` field gets first non-default value | 🟡 yes (acceptable — ADR-0027 already validated discriminator-vs-separate-model debate) | ✅ no | ✅ no |
| Implementation cost | 🟢 ~1-2 days, 8 small units | 🟡 ~3-4 days | 🔴 ~1 week |
| Rolls forward to JobApplication / Interview procedures | 🟢 yes via mentions | 🟡 awkward | 🟡 awkward |

## Decision

**Option A — `WorkLog.kind: "procedure"` discriminator.**

The choice flips from ADR-0027's verdict because procedures lack procedure-specific fields. Every feature the user expects (rich body, photos, version history, search, archive, mentions, markdown export, folders) is delivered by the existing `WorkLog` shape. The only schema cost is one column and one composite index.

The "All notes" pollution risk is mitigated by adding a `kind="note"` filter to the default `/worklog/notes` query — an additive change with one extra test, not a structural redesign.

## Schema diff (final)

```prisma
model WorkLog {
  // ...existing fields...
  kind String @default("note")  // NEW — "note" | "procedure"

  @@index([userId, kind])  // NEW — list-page filter selectivity
}
```

That is the entire schema cost. `assetIds: String[]` (with GIN index), `search_vector` tsvector, `archivedAt`, the `WorkLogVersion` foreign key, and all mention-projection columns (`linkedNoteIds`, `linkedContactIds`) are reused as-is.

## Migration plan

- Migration name: `20260615_add_worklog_kind`
- Sanitize tsvector drift per `docs/workflows/recover-from-prisma-drift.md` (same recipe used for ADR-0028)
- `ALTER TABLE "WorkLog" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'note';` — every existing row instantly becomes `kind="note"`, no behavior change anywhere
- `CREATE INDEX "WorkLog_userId_kind_idx" ON "WorkLog" ("userId", "kind");`
- **No backfill script needed** (the `DEFAULT 'note'` IS the backfill)

## Implementation sketch — 8 units

| # | Unit | Files | Tests added |
|---|---|---|---|
| 1 | Schema + migration | `prisma/schema.prisma`, `prisma/migrations/20260615_add_worklog_kind/migration.sql` | n/a |
| 2 | Default-filter `/api/work-logs` GET to `kind="note"`; accept `?kind=procedure` opt-in | `src/app/api/work-logs/route.ts` (+ `?archived=` cohabitation), `useWorklogData` hook | +2 cases |
| 3 | PUT preserves `kind` (audit guard — can't accidentally flip kind via update) | `src/app/api/work-logs/[id]/route.ts` | +1 case |
| 4 | List page `/worklog/procedures` — mirror `/worklog/events` shape | `src/app/(app)/worklog/procedures/page.tsx`, `WorklogProceduresView` | UI — no TDD per ADR-0018 |
| 5 | Sidebar "Procedures" row — between Events and Archived | `WorklogNavSidebar` | UI |
| 6 | POST accepts `kind` in body; "+ New procedure" CTA on `/worklog/procedures` | `src/app/api/work-logs/route.ts` (POST), CTA component | +1 case |
| 7 | `@r:` mention type — wire-mention-entity-type.md recipe rev-3 (8-step) | `mention-node.ts` (`r` prefix, `procedure` entity type, ENTITY_TYPE_CONFIG, TYPE_PICKER_ITEMS), `mention-suggestion-popup.tsx` (`TYPE_PREFIX_HINTS`), `mention-search/route.ts` (`procedure` case → `findById` + `searchEntities` against `WorkLog` filtered to `kind="procedure"`), `prosemirror-to-text.ts` (extractor handles `procedure` entityType — same as `worklog`) | +3 cases |
| 8 | "Procedures for this asset" rail in `AssetDetailModal` — cross-cut backlinks per ADR-0028 recipe | `GET /api/job-assets/[id]/procedures/route.ts`, `JobAssetProceduresSection` component (collapsed by default, expandable), mount in `AssetDetailModal` | +5 cases |

**Total tests: +12 cases, full suite 673 → 685 (target).**

## UX summary

- New **Procedures** row in worklog left nav, between Events and Archived.
- New **`/worklog/procedures`** list page (same shape as `/worklog/events`), filtered to `kind="procedure"`, sorted by recency, with a `+ New procedure` button.
- `/worklog/notes` appearance unchanged — silently filters out procedures.
- **JobAssetDetailModal** gains a "Procedures for this asset" section, **collapsed by default**, expandable. Empty state surfaces `@r:` discoverability hint (same pattern as ADR-0028 ContactBacklinksSection).
- Type `@r:` in any worklog note → procedure picker → chip → click chip routes to the procedure via the existing focus contract.
- Quick Capture is **not** modified in v1 (parked).

## Mention prefix decision

Locked to **`r`** for "runbook" — industry term, single ASCII letter, free in the existing `a / s / c / p / n` namespace.

## ENTITY_TYPE_CONFIG addition

```ts
procedure: { badge: "R", typeLabel: "Runbook", color: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
```

`rose` is the next free hue after `blue / emerald / amber / purple / indigo`.

## Out of Scope (parked under ADR-0029)

| Parked | Re-entry trigger |
|---|---|
| Procedure status lifecycle (draft / published / deprecated) | First user complaint about "stale procedure shown to teammate" |
| Per-procedure review/expiry date with notification | First request for "remind me to review this every 6 months" |
| Procedure execution log ("I followed this procedure on 2026-06-15" with auto-pivot) | First request for compliance/audit-style tracking |
| Multi-user assignment / sign-offs | Multi-user mode (not on roadmap) |
| `kind: "incident"` or other 3rd kind | Use of `kind` field for a third value |
| Procedures appearing inside Categories / Folders default views | UX feedback — `/worklog/procedures` is the canonical home for v1 |
| "New procedure" entry in the Quick Capture menu on `/worklog` home | UX feedback — list-page CTA is the canonical creation seam for v1 |
| Cross-cut "Procedures for this contact" reverse-lookup | First request — pattern is identical to JobAsset application |
| Auto-promotion of an existing note to a procedure (toggle `kind`) | First request — for v1, procedures are created as procedures |

## Consequences

**Pros**

1. **Massive reuse.** Editor, autosave, version history, search, archive, mentions, markdown export — all free. ~1-2 day ship vs ~1 week for a separate model.
2. **Pattern stability.** The `wire-mention-entity-type.md` recipe stays a generalized 8-step template; `@r:` is the third application after `@n:` (ADR-0016) and `@p:`-backlinks (ADR-0028). The recipe earns its keep.
3. **Cross-cut "Procedures for this asset" comes for free** via the ADR-0028 cross-cut backlinks recipe — no new architectural work, just a copy-paste of the route shape filtered by `kind="procedure"`.
4. **No data migration risk.** `DEFAULT 'note'` makes the migration a no-op for every existing row.
5. **Open seam for future kinds.** If "incident" or another kind ever needs the same treatment, the `kind` discriminator is already in place.

**Cons / Trade-offs**

1. **`kind` field is now part of every WorkLog read/write call.** Three call sites need the default filter (`/api/work-logs` GET, list-page query, search). One PUT-route audit case to lock the kind from accidental flipping. Manageable but real.
2. **"All notes" pollution risk if filter is forgotten.** Mitigated by Unit 2's TDD case, but any new query path that reads `WorkLog` rows needs to make a deliberate choice about kind. Will need a one-line note in `wire-mention-entity-type.md` for future entity types that should respect `kind`.
3. **Search ranking may surface procedures alongside notes** in tsvector queries. v1 keeps `search_vector` shared; if users complain that a procedure search-bombs the daily-note feed, parked option is to add a `kind` filter to `WorkLogSearchView`.
4. **Procedures will not appear in Folders/Categories default views** — a deliberate v1 simplification (parked). Users who want to bucket procedures by team/site will need to revisit when the feature is asked for.
5. **`WorkLogTemplate` becomes structurally adjacent to procedures.** A future user who wants "this procedure should be the starting point for a new note" has to copy/paste body content; no convert-procedure-to-template path. Parked.
