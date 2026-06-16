# Worklog Procedures (Runbooks)

**Status:** Shipped (2026-06-15)
**Owner:** Sory
**Related ADR(s):** [0029](../docs/adr/0029-worklog-procedures.md), [0027](../docs/adr/0027-worklog-events.md), [0028](../docs/adr/0028-persona-contact-reverse-lookup.md), [0016](../docs/adr/0016-note-to-note-linking-and-backlinks.md)
**Source files:**

- `prisma/schema.prisma` (`WorkLog.kind: String @default("note")` + `@@index([userId, kind])`)
- `prisma/migrations/20260615205242_add_worklog_kind/migration.sql`
- `src/app/api/work-logs/route.ts` (GET + POST — `?kind=` filter, accepts `kind` body param)
- `src/app/api/work-logs/[id]/route.ts` (PUT — preserves `kind`; new test guards the audit)
- `src/app/(app)/worklog/procedures/page.tsx` (list route)
- `src/components/worklog/worklog-procedures-view.tsx` (list view + create CTA)
- `src/components/worklog/worklog-nav-sidebar.tsx` (left-nav row)
- `src/lib/worklog/tiptap/mention-node.ts` (`@r:` prefix, rose `R` badge)
- `src/components/worklog/mention-suggestion-popup.tsx` (`@r: Runbook` hint)
- `src/app/api/work-logs/mention-search/route.ts` (`procedure` EntityType branch + worklog kind scoping)
- `src/app/api/job-assets/[id]/procedures/route.ts` (cross-cut: which procedures reference this asset?)
- `src/components/job-asset-procedures-section.tsx` (UI surface mounted in `AssetDetailModal`)

---

## 1. Functional Description

A **procedure** (or **runbook**) is a written instruction set for how to do a recurring thing — "PM-grease conveyor C-204", "Run the weekly retro", "Lockout-tagout for Site B". It lives in the same `/worklog` zone as notes and events, surfaced via a new left-nav row labelled **Procedures** with a `ClipboardList` icon and (when non-zero) a count badge.

Clicking the row navigates to `/worklog/procedures` — a year-grouped list of every WorkLog row whose `kind` is `procedure`. A `+ New procedure` button at the top creates a blank procedure (title `"Untitled procedure"`, today's date) and routes the user straight into the editor at `/worklog/notes/[id]` (procedures share the editor with notes).

A procedure is mentionable from any worklog note via `@r:` — the picker shows a rose `R` chip alongside the existing `@a:` `@s:` `@c:` `@p:` `@n:` chips. Inside the procedure itself you can mention assets, skills, contacts, and notes the same way — so a runbook can reference the asset(s) it applies to via `@a:` chips, which projects through the existing `assetIds: String[]` GIN column.

When you open the **Edit Asset** dialog on `/job-assets`, a new collapsible **Procedures** section appears in the right column under "Service history". Expanding it issues an enabled-gated query that lists every procedure mentioning that asset, ordered by date. Clicking a row navigates into `/worklog/notes/[id]` to read or edit the runbook.

**Example user story:** *"I'm at the conveyor pulling a fault. I open the asset card → expand Procedures → see "PM-grease C-204" and "Bearing replacement — drum #3". I tap the bearing one → the runbook opens with `@a:` already linking back to this asset and `@p:` linking to the parts vendor I called last time. I follow the steps, check off items, and add a new line at the bottom. Saved automatically. Tomorrow when someone else hits the same fault, the runbook is already there."*

## 2. Internal Workflow

### Schema (Unit 1)

1. `WorkLog.kind: String @default("note")` — single-table inheritance discriminator. Existing rows backfill to `"note"` via the column default; no data migration needed.
2. `@@index([userId, kind])` composite index — every list query is owner-scoped already, this just makes the kind filter free.
3. **No separate `Procedure` model.** Procedures are WorkLogs with `kind="procedure"`. They reuse the editor, version history (ADR-0017), search (ADR-0011), folders (ADR-0011a), drag-and-drop (ADR-0012), all five mention chip types, and the `assetIds`/`linkedNoteIds`/`linkedContactIds` projections out of the box. ADR-0027 set the precedent with `kind="event"`.

### List route (Units 2 + 4 + 5)

1. `GET /api/work-logs?kind=procedure` returns rows where `kind="procedure"` — projection-only, no schema migration. Default (no `?kind=`) and `?kind=note` both filter to `kind="note"` so the existing notes view doesn't accidentally surface runbooks.
2. `WorklogProceduresView` (a TanStack-Query client component) fetches with key `["worklogs","procedures"]`, groups rows by `getFullYear(date)` desc, and renders skeleton/error/empty/populated states.
3. `WorklogNavSidebar` reads the same query key for its count badge — TanStack Query dedupes the fetch, so the sidebar count and the list view share one network call.

### Create flow (Unit 6)

1. `+ New procedure` POSTs to `/api/work-logs` with `{ kind:"procedure", title:"Untitled procedure", date: <now> }`.
2. `POST /api/work-logs` accepts `kind` in the body, normalizes it to `"note" | "procedure"` (anything else → 400 fallback), and persists. Without this gate a malformed body would default to `"note"` and silently misroute the user's runbook into the notes list.
3. On `201` the client invalidates the procedures cache and `router.push`es to `/worklog/notes/[id]` — the editor and reader are shared with notes.

### PUT preservation (Unit 3)

1. `PUT /api/work-logs/[id]` deliberately omits `kind` from its update whitelist. A regression test guards this — sending `{ kind: "procedure" }` in a note's PUT body must NOT flip the kind silently. Kind is set at create time, period. (Future moves between notes ↔ procedures will require an explicit endpoint, parked.)

### `@r:` mention type (Unit 7)

1. `mention-node.ts`: `MentionEntityType` union extended with `"procedure"`, `ENTITY_TYPE_CONFIG.procedure = { badge: "R", typeLabel: "Runbook", color: rose }`, `PREFIX_MAP.r = "procedure"`, `TYPE_PICKER_ITEMS` appended, regex extended to `[ascpnr]`.
2. `mention-suggestion-popup.tsx`: `TYPE_PREFIX_HINTS` appended with `{ prefix: "r", entityType: "procedure", hint: "@r: Runbook" }`.
3. `mention-search/route.ts`: `EntityType` and `VALID_TYPES` extended with `"procedure"`. New `findById` and `searchEntities` cases scope `workLog` lookups by `kind: "procedure"`. **The existing `worklog` cases are retroactively scoped to `kind: "note"`** — this is the kind-discriminator filter pattern (rev-4 of the `wire-mention-entity-type` recipe). Without this, picker rows leak across kinds and an `@n:` orphan-detection check could resolve a procedure id, and vice-versa.

### Cross-cut: procedures-for-this-asset (Unit 8)

1. `GET /api/job-assets/[id]/procedures` follows the ADR-0028 cross-cut backlinks recipe with one composition: it reuses the existing `assetIds: String[]` GIN column and **adds** `kind: "procedure"` to scope the result set to runbooks. No new column, no new index, no new schema migration.
2. Owner-scoped twice: (a) `prisma.jobAsset.findFirst({ where: { id, userId } })` → 404 if the asset isn't owned (never silently empty-array unowned ids — that would conflate "not yours" with "no procedures linked"); (b) `prisma.workLog.findMany({ where: { userId, kind: "procedure", assetIds: { has: id } }, orderBy: { date: "desc" } })`.
3. `JobAssetProceduresSection` is **collapsed by default** with the TanStack Query `enabled`-gated on expansion — the network call doesn't fire on every modal open. `staleTime` is 30s while open. Click pivots via `router.push("/worklog/notes/" + id)` (cross-route, so the asset modal stays on the back-stack).

## 3. Configuration / Params

| Name | Location | Default | Purpose |
|------|----------|---------|---------|
| `kind` discriminator default | `prisma/schema.prisma` (WorkLog) | `"note"` | Existing rows backfill on column add; new POSTs without `kind` default to note |
| `(userId, kind)` composite index | `prisma/schema.prisma` (WorkLog) | GIN-friendly btree | Makes the kind filter free on owner-scoped queries |
| Procedures cache key | `["worklogs","procedures"]` | shared by list + sidebar count | TanStack dedupe → one network call powers both UIs |
| Procedures section `staleTime` | `src/components/job-asset-procedures-section.tsx` | `30000` ms | Freshness window while the modal is open |
| Procedures section default state | `src/components/job-asset-procedures-section.tsx` | collapsed | Avoids network noise on every asset modal open |
| `@r:` chip color | `src/lib/worklog/tiptap/mention-node.ts` | `bg-rose-100 / text-rose-800` | Rose hue chosen to be unique vs blue/emerald/amber/purple/indigo |

## 4. Known Constraints

- **No bidirectional kind move.** A note cannot be flipped to a procedure (or vice-versa) through the UI yet — `PUT /api/work-logs/[id]` deliberately ignores `kind`. If the user creates the wrong kind, they delete and recreate. (Parked: ADR-0029 backlog item — add an explicit `PATCH /api/work-logs/[id]/kind` route.)
- **Procedures share the notes editor.** There's no procedure-specific UI — no step numbering, no checklist primitives, no version-comparison highlight on procedure-shaped diffs. The editor is the same Tiptap surface as notes (ADR-0010). Markdown roundtrip and Grill Me work the same way.
- **No procedure templates.** "+ New procedure" creates a blank doc with title `"Untitled procedure"`. There's no template gallery, no "duplicate this procedure" action. (Parked.)
- **No procedure folders.** ADR-0011a folder taxonomy is scoped to notes. Procedures show as a flat year-grouped list. (Parked — folders for procedures is a separate sprint if the list grows past a screenful.)
- **No archive integration in this sprint.** ADR-0026 archive bucket scopes to notes; procedures with `archivedAt != null` won't appear in the procedures list, but there's no archive view for procedures yet. (Parked.)
- **No cross-cut UI for skills, companies, or contacts → procedures.** Only `JobAsset` has a "procedures linked here" panel (ADR-0029 Unit 8). Other entity types can be added the same way — same recipe — but weren't part of this sprint. (Parked.)
- **Mention search labels are derived from `WorkLog.title`** (procedure case) — not denormalized. A procedure with no title falls back to first content line via `deriveWorklogLabel`. Same fallback as notes.
- **No event-vs-procedure-vs-note picker chip in the editor itself.** When you mention `@r:` from inside a procedure, the picker shows procedures only — no leakage into events (`kind="event"`) or notes (`kind="note"`). This is enforced by the kind-discriminator filter on `mention-search/route.ts`.

## 5. Verification

**Tests:** 687/687 (52 → 54 test files, +14 cases across 5 commits — Units 2, 3, 6, 7, 8). Vitest run `npm test` against the live PostgreSQL schema clean.

**Manual smoke (deferred to next session — see handoff):**

- Open `/worklog/procedures` → empty state shown → click "+ New procedure" → routed to editor with title "Untitled procedure".
- Type a body → autosave → return to `/worklog/procedures` → row visible, label = title, year-grouped.
- Sidebar `Procedures` row shows `(1)` count badge.
- Open `/job-assets`, edit any asset, expand Procedures → if any procedure mentions this asset via `@a:`, it appears here. Otherwise empty hint shown.
- Type `@` in any worklog note → type-picker shows 6 chips (`A S C P N R`). Type `@r:` → live picker filters procedures only.
