# Workflow: Add Version History to a Tiptap-Backed Document

**Workflow type:** `add-version-history-feature`
**Last Updated:** 2026-06-09
**Origin sprint:** ADR-0017 (worklog version history + visual diff).
**Authority level:** ADVISORY — starting point, not a hard rule. Acknowledge and justify deviations.

This recipe applies when a Tiptap-backed document needs **version history**: durable snapshots of past states, a UI panel to browse them, a visual diff against the current document, and a restore action. Built on top of an existing PUT save route that already debounces autosave.

## When this applies

- A document model already exists (e.g. `WorkLog.contentJson`).
- Edits flow through a single PUT route you can hook (or a job/queue you can extend).
- Users want to browse history, compare an old version to current, and restore.
- Y.js is in the stack but a "broadcast restore as Y.update to other devices" feature is OUT OF SCOPE for v1 (see Gotchas).

## Stack Context

- Prisma v6 (custom output `node_modules/.prisma/client`)
- Next.js 16 + Turbopack
- TanStack Query v5
- Tiptap 3 + Y.js (StarterKit with `undoRedo: false`)
- base-ui Dialog (`@base-ui/react/dialog`) — NOT Radix
- Vitest 4 with TDD scope per ADR-0018 (`src/lib/**`, `src/app/api/**`, `src/data/**`)

## Successful Sequence

1. **Schema** — add a `XxxVersion` table with FK to parent doc, `ON DELETE CASCADE`. Columns: `id`, `<doc>Id`, `label String?`, `isManual Boolean @default(false)`, `contentJson Json`, `plainText String`, `plainTextPreview String` (200-char truncation, used in list endpoint), `charDelta Int` (signed delta vs prior version's plainText length), `createdAt DateTime @default(now())`. Index `(<doc>Id, createdAt DESC)`.
2. **Migration** — `npx prisma migrate dev --name add_<doc>_versions`. Confirm cascade by inspecting the generated SQL.
3. **Pure helpers (TDD: RED → GREEN → REFACTOR)** in `src/lib/<domain>/version/`:
   - `grouping.ts` — `groupVersionsByDate({versions, now})` returns `{today, yesterday, thisWeek, older}` arrays. **`thisWeek` MUST be anchored to `now`, not start-of-day**, so exact-7-days-ago lands in `thisWeek` not `older`.
   - `diff.ts` — `computePlainTextDiff(prev, next)` returns `DiffSegment[]`. LCS DP backtrack at the **token** level. Tokenizer regex: `/(\n)|([^\s\n]+)|([ \t]+)/g`. Words, horizontal whitespace, and newlines MUST be separate tokens — gluing whitespace to words breaks prefix-match alignment.
   - Coalesce same-type adjacent segments at the end.
4. **Auto-snapshot writer in PUT route (TDD)** — wrap snapshot logic in a try/catch with `console.error("[ADR-XXXX] auto-snapshot write failed", err)`. Snapshot failures MUST NOT fail the user save (best-effort). Same guarantee for any inline retention thinning.
5. **List endpoint (TDD)** — `GET /api/<doc>s/[id]/versions`. Owner-scoped via `findFirst({where: {id, ownerId}})` first, then list versions ordered by `createdAt DESC`. Return only the truncated `plainTextPreview`, NOT full `plainText` or `contentJson` (keeps payload small).
6. **Manual snapshot endpoint (TDD)** — `POST /api/<doc>s/[id]/versions` with body `{label: string|null}`. Trim + slice to 80 chars; empty → null. Compute current `plainText` + `charDelta` server-side, write `isManual: true`.
7. **Per-version GET (TDD)** — `GET /api/<doc>s/[id]/versions/[versionId]`. Returns FULL `{id, createdAt (ISO), label, isManual, contentJson, plainText}`. Diff modal needs this — list endpoint's preview is too short.
8. **Restore endpoint (TDD)** — `POST /api/<doc>s/[id]/versions/[versionId]/restore`. Inside a transaction: (a) write a `Before restore from <ts>` pre-snapshot of the CURRENT state with `isManual: true`, (b) overwrite the doc's `contentJson` + `content` with the chosen version's payload. Return the new doc state.
9. **History panel UI** (`<XxxHistoryPanel>`):
   - `useQuery(["xxx-versions", noteId])` with 15s `staleTime`.
   - Group via `groupVersionsByDate`.
   - Per-row: label-or-"Auto" + time + colorized `charDelta` (emerald positive / red negative) + `plainTextPreview` + `View diff` + `Restore` buttons.
   - Restore confirm uses **controlled base-ui Dialog**, NOT `window.confirm` (see Gotchas).
   - `restoreMutation` invalidates `["work-logs"]` (or your doc list key) AND `["xxx-versions", noteId]`.
   - Empty state: "No versions yet — snapshots appear as you edit."
10. **Diff modal UI** (`<XxxVersionDiffModal>`):
    - Props `{open, noteId (REQUIRED), version, currentPlainText, onClose}`.
    - `useQuery(["xxx-version", noteId, version.id], enabled: open)` — fetches the per-version GET.
    - Render `computePlainTextDiff(snapshot.plainText, currentPlainText)` with `bg-emerald-100` / `bg-red-100 line-through` (plus dark variants).
11. **Toolbar Save Version button** — add optional `<doc>Id?: string` to your toolbar's props. Button only renders when prop is provided. Use a controlled Dialog with an Input for the optional label (max 80 chars). On submit POST to the manual snapshot endpoint and invalidate the panel query.
12. **Mount surface decision** — most pages should NOT mount History in the drawer/preview tier. Mount only in the full-screen reader. Backlinks-style "in both" is the exception, not the default.

## First-Attempt Failures

- **Tokenizer glued whitespace to words** — first regex was `/(\n)|([^\s\n]+[ \t]*)|([ \t]+)/g`. Made `"world"` ≠ `"world "`, broke the "marks an appended word as an addition" test (expected exactly 2 segments after coalescing). **Fix**: separate-token tokenizer above.
- **Diff modal had optional `noteId?`** — first attempt wrapped a `DiffModalInner` with optional prop. Wrong shape. Make `noteId: string` mandatory on the public component.
- **`window.prompt()` for label, `window.confirm()` for restore** — both throw `Error: prompt() is not supported.` in Next.js 16 / React 19 dev mode. Caught only at smoke-test, not by `get_errors` (LSP can't see it). **Fix**: controlled base-ui Dialog from the start.

## Gotchas

- **Y.js sync after restore is HARD.** A simple `prisma.update` doesn't tell connected Y.Doc sessions anything. Other open devices keep their stale state until next reload. v1 ships restore as "best-on-the-device-that-clicked"; broadcast-Y-update is a separate sprint.
- **Inline retention thinning is best-effort.** Same try/catch pattern as the auto-snapshot writer. If `deleteMany` throws, log and continue — don't fail the user's save.
- **Schema migrations on a drifted dev DB**: see [docs/workflows/recover-from-prisma-drift.md](recover-from-prisma-drift.md). For Resumsify specifically the drift was resolved 2026-06-09 (migration `20260609180000_baseline_drift_capture`); `prisma migrate dev` is again the correct tool.
- **Test-Driven Development scope (per ADR-0018)**: helpers + routes are mandatory RED-GREEN-REFACTOR. UI components (`*.tsx`) are out of TDD scope until a jsdom stack is installed. Smoke-test the UI in the browser instead of a unit test.
- **`window.prompt()` / `window.confirm()` / `window.alert()` are blocked** in Next.js 16 + React 19 dev. Use a controlled Dialog. This applies to ANY new client component, not just version history.

## Validation Checklist (before declaring "done")

- [ ] All routes 401 when no session, 404 when not the owner, 404 when version doesn't belong to the parent doc.
- [ ] Auto-snapshot write failure logs and does NOT bubble — user save still 200s.
- [ ] Restore endpoint writes the `Before restore from <ts>` pre-snapshot in the SAME transaction as the overwrite.
- [ ] History panel renders empty state when no versions, then groups + sorts correctly when populated.
- [ ] Diff modal opens, fetches full snapshot, renders green/red segments.
- [ ] Save Version button: prompts for label, allows empty, allows cancel, refreshes the panel on success.
- [ ] Restore button: confirm dialog, then visible new `Before restore from {ts}` row + restored content.
- [ ] Smoke-test (browser): all of the above, AND verify no `window.prompt`/`confirm`/`alert` calls.
