# Workflow: Wire a New Mention Entity Type Into the Tiptap @-Picker

**Workflow type:** `wire-mention-entity-type`
**Last Updated:** 2026-06-09
**Origin sprint:** ADR-0016 (note-to-note linking) — fifth entity type added to a four-type picker.

This recipe applies when adding a **new entity type** to the worklog `@`-mention system (e.g. adding `@n:` for notes alongside existing `@a:` asset, `@s:` skill, `@c:` company, `@p:` contact). The mention infrastructure projects each chip's `entityId` into a structured `WorkLog.<kind>Ids: String[]` column with a GIN index for fast lookups, so new types follow a predictable shape: pick a single-letter prefix, decide if it's additive or replacement, and follow the eight steps below.

## When this applies

- You want a new `@x:` chip type inside `WorklogEditor` (Tiptap 3 + `@tiptap/suggestion`).
- The new type has a stable owner-scoped table in Prisma (or a virtual identity, like distinct workHistory.company values).
- You're OK with **plain-text matching** at the picker — no fuzzy ranking, no fulltext.
- The mention should both insert a chip AND project to a structured column (so backlinks / "find notes that mention X" stay cheap).

If you only need the chip for display (no column projection, no backlinks), you can stop after step 4.

## Stack Context

- Tiptap 3, `@tiptap/suggestion@3`, custom `MentionNode` extending `Node.create<MentionNodeOptions>`.
- Prisma 6 + PostgreSQL with GIN-indexed `String[]` columns (`assetIds`, `linkedNoteIds`, …).
- TanStack Query v5 for the picker fetch + mention-existence cache.
- Next.js 16 App Router for the search and (optionally) backlinks routes.

## Successful Sequence

1. **Pick the prefix and confirm uniqueness.** One ASCII letter, no overlap with existing types. Update the regex at the top of `mention-suggestion.ts` so the new letter is accepted: `/^([ascpn]):(.*)$/` etc. The prefix becomes part of the user-facing ergonomics — short and intuitive trumps strict acronym matching (`@n:` for note beats `@nt:`).

2. **Extend the type model in `mention-node.ts`.**
   - Add the new value to the `MentionEntityType` union.
   - Add a `ENTITY_TYPE_CONFIG[<type>]` entry: `badge` (single uppercase letter), `typeLabel` (display name), `color` (Tailwind classes — pick a hue not yet used).
   - Add a `PREFIX_MAP[<letter>] = <type>` mapping.
   - Append a `TYPE_PICKER_ITEMS` entry so the empty-prefix picker advertises the new type.

3. **Add the picker hint in `mention-suggestion-popup.tsx`.**
   - Append `{ prefix, entityType, hint: "@<letter>: <Display>" }` to `TYPE_PREFIX_HINTS`. The popup shows this hint while the user is mid-typing.

4. **Decide additive vs replacement, and implement extraction.**
   - **Additive** (mentions only ADD; manual entries persist) — copy the `extractMentionAssetIds` pattern. Used for accordion-style picker columns like `assetIds`.
   - **Replacement** (the doc IS the source of truth; chip removal removes link) — generalize via `extractMentionEntityIds(doc, "<type>")` from `prosemirror-to-text.ts`. Used for note-to-note `linkedNoteIds`.
   - Inline-atom mentions sit inside `paragraph.content`, NOT at the doc root. Walk recursively (the existing helper does this) — this is a recurring gotcha.

5. **Harden the PUT route in `src/app/api/work-logs/[id]/route.ts`.**
   - Compute the new id list at save time with the appropriate semantic.
   - Apply a write-time **self-loop guard** if the new type can reference itself (e.g. note-to-note): `.filter((id) => id !== currentLogId)`.
   - Apply the **skip-if-equal** guard via `arraysEqualAsSets(next, existing)` so the GIN index doesn't churn on every keystroke autosave that didn't touch mentions. Add a boolean `writeXIds` flag and conditionally spread the column into the update payload.

6. **Extend `mention-search/route.ts`.**
   - Add the new type to `EntityType` union and `VALID_TYPES` set.
   - Add a `findById` case (existence check used by the orphan-detection NodeView).
   - Add a `searchEntities` case (used by the picker). For search, prefer the cheapest plain-text column that already has a btree-friendly path — don't reach for tsvector unless the latency forces it.
   - Honor `excludeId` by adding `id: { not: excludeId }` when present, regardless of type. This is what blocks self-suggestion on note-to-note pickers and is cheap defense-in-depth elsewhere.

7. **Wire `currentLogId` (or equivalent) into the editor mount.**
   - `MentionNode.configure({ currentLogId: workLogId })` in the editor's extension list. The `addOptions()` declaration in `mention-node.ts` reads it back via `this.options.<key>` from `addProseMirrorPlugins`. Without this wiring, the picker can't pass `&excludeId=` and self-references slip through.

8. **(Optional) Add a backlinks API + UI panel.**
   - `GET /api/work-logs/[id]/backlinks` runs `prisma.workLog.findMany({ where: { userId, <kind>Ids: { has: id }, NOT: { id } } })` and projects the rows to `{ id, label, date, ... }`.
   - The UI panel uses TanStack Query (~30s `staleTime`), an empty state, and clickable rows that pivot via `router.replace(${pathname}?focus=${row.id})` (ADR-0015 contract).
   - Slot the panel into the relevant reader surface(s) — drawer + standalone read view + (if relevant) the editor itself.

## TDD checklist (Phase 2.5)

- `extractMentionEntityIds` — fixture covers top-level paragraphs AND nested bulletList/listItem AND deeply-nested blockquote AND duplicates AND missing entityId guard.
- `arraysEqualAsSets` — empty/identical/order-insensitive/dedup/differ-by-one/same-length-different/empty-vs-nonempty.
- PUT route — populate, self-loop guard (when applicable), skip-if-equal, replacement-clears-on-chip-removal, untouched-when-no-contentJson.
- mention-search — search + existence + excludeId + cross-user isolation.
- backlinks route (when present) — 401 + owner scope + self-filter + empty array + label fallback.

## Pitfalls

- **Inline-atom walker miss**: When extending `extractMention*`, remember `mention` lives inside `paragraph.content`, not at the doc root. The recursive helper handles this; ad-hoc walkers don't.
- **Suggestion option shape**: `buildMentionSuggestion(currentLogId)` MUST be a factory taking the option, not a closure over module state. The previous shape (`mentionSuggestion` as a const) made it impossible to pass per-instance config.
- **Empty `q` + non-null `excludeId`**: A picker that opens with no typed query still hits the API. Make sure the `id: { not: excludeId }` filter is applied even when `term === ""`.
- **Skip-if-equal must compare AFTER unioning**: For additive types, compare the merged set against the stored set, NOT the raw mention extraction. Otherwise small inserts that don't change the set still trigger writes.
- **`ENTITY_TYPE_CONFIG` lookups need a fallback**: Old saved chips with a now-removed type would break the renderer. Always `?? ENTITY_TYPE_CONFIG.asset` (or equivalent default) in both the NodeView and the read-mode renderer.

## Verify

- New `@x:` chip inserts and renders in edit mode.
- Picker filters by query, respects `excludeId`, and stops at 8 results.
- Save round-trip persists the projected column with the skip-if-equal guard not firing on no-op autosaves (check the network panel — single autosave should NOT include the column when content didn't change).
- (If applicable) Backlinks panel renders, empties cleanly, and click-pivots without back-stack noise.
