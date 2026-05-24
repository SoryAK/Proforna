# Worklog W1 + W2 — Sprint Roadmap

> **Status:** Accepted — execution started 2026-05-23
> **Owner:** Sory
> **Decisions locked:**
> 1. Drag-and-drop: full rail only (Popover flyout stays click-only)
> 2. Search scope: when a folder is selected, search is scoped to **that folder + descendants**
> 3. Sequencing: **parallel-where-safe** — refactor lands first as its own commit; search + bulk built on top after

---

## Sprint W1 — Foundations

### W1.1 Refactor `worklog-page.tsx` (716 → ≤ 600)

**Target structure:**
```
src/components/worklog/
  worklog-page.tsx                      ← orchestrator (~330 lines)
  page/
    use-worklog-preferences.ts          ← defaults query + saveDefaults
    use-worklog-visible-logs.ts         ← folder→filter sync + visibleLogs memo
    use-worklog-stats.ts                ← streak, totalThisMonth, notableCount
    use-worklog-create-flow.ts          ← createBlankNote + quick-capture + copy-last + template apply
    use-worklog-keyboard-nav.ts         ← shortcuts effect + pane focus + cycle
    worklog-template-picker-dialog.tsx  ← extracted modal
```

**Acceptance:** every worklog file < 600 lines; all flows pass smoke test; no behavior change; `pnpm tsc --noEmit` clean.

### W1.2 Full-text search (after refactor)

**Schema:**
```prisma
model WorkLog {
  // ...
  searchVector Unsupported("tsvector")? @map("search_vector")

  @@index([searchVector], type: Gin)
}
```
Generated column via raw SQL in the migration: `tsvector_to_tsvector('english', coalesce(title,'') || ' ' || coalesce(plain_body,''))`.

**API:** `GET /api/work-logs/search?q=&folderId=&limit=20`
- Returns: `{ id, title, snippet, folderId, date, rank }[]`
- When `folderId` provided: filter to that folder + all descendants (uses `collectDescendantIds`)
- Tiptap → plain-text already exists; server-side derivation on save

**UI:**
- Replace the existing client-side `search` `.includes()` filter in [worklog-toolbar.tsx](src/components/worklog/worklog-toolbar.tsx)
- Debounce 250ms
- `⌘K` or `/` opens command-palette overlay with results (the `/` shortcut already exists for focus — extend it)
- Result rows show snippet with `<mark>` highlight

### W1.3 Bulk multi-select

**API:** `POST /api/work-logs/bulk` with body:
```ts
{ action: "move" | "delete" | "pin" | "unpin", ids: string[], payload?: { folderId?: string | null } }
```
Wrapped in a Prisma `$transaction`.

**UI:** [worklog-notes-list.tsx](src/components/worklog/worklog-notes-list.tsx)
- Checkbox column, appears on hover or after first selection
- `Shift+click` for range; `⌘/Ctrl+A` selects visible
- Floating action bar: **Move to folder…** · **Pin** · **Delete**
- `Esc` clears selection

---

## Sprint W2 — Organization power

### W2.1 Drag-and-drop reorder & reparent

**Library:** `@dnd-kit/core` + `@dnd-kit/sortable`
**Scope (rail only):**
- Drag note → folder (drop on folder row)
- Drag folder → folder (reparent; respect `FOLDER_MAX_DEPTH = 8`; reject cycles)
- Drag note ↕ within list (reorder — requires new `sortOrder: Int` column on `WorkLog`)
- Visual drop indicator (1px ring + bg tint)
- `Esc` cancels mid-drag

**Out of scope:** DnD inside the embedded Popover flyout (click-to-move stays the path there).

### W2.2 Pinned notes

**Schema:**
```prisma
model WorkLog {
  pinned   Boolean   @default(false)
  pinnedAt DateTime?
  @@index([pinned, pinnedAt(sort: Desc)])
}
```
**UI:**
- Pin/unpin in note kebab + bulk action
- "📌 Pinned" pseudo-folder at top of rail (above Unfiled)
- Within any view: pinned-first, then existing sort

### W2.3 Folder colors

**Schema:** `WorklogFolder.color: String?` — token: `slate | blue | emerald | amber | rose | violet | pink`
**UI:** color picker swatches in folder create/rename dialogs; left border + icon tint in tree (full rail + Popover flyout).

### W2.4 Filter chips

**Toolbar chips:** `Today | This week | Pinned | Has photos | Has links`
- Multi-toggle, persist last set in `localStorage` key `worklog:filters:v1`
- Combined with search → server-side filter param when search active
- Chips visible on both `/worklog` page and embedded job-map view

---

## Out of scope (deferred)

- Tags (Sprint W3)
- Linked entities (Sprint W3)
- Export PDF/Markdown (W4)
- Virtualization (W4)
- LLM weekly summary (W5)

---

## Risk register

| Risk | Mitigation |
|---|---|
| Refactor breaks Yjs collaboration wiring | Snapshot test reader before/after; manual smoke on multi-tab session |
| `tsvector` migration on existing rows | Backfill in migration with `UPDATE ... SET search_vector = ...` |
| DnD library bumps Next/React bundle | `@dnd-kit` is tree-shakable; measure before/after with `next build` |
| Pinned + folder-color schema changes need careful migration ordering | One migration per concern; never combine |

---

## References
- Folder hierarchy ADR: [docs/adr/0011-worklog-user-defined-folders.md](docs/adr/0011-worklog-user-defined-folders.md)
- Three-pane redesign: [docs/adr/0007-worklog-notes-three-pane-redesign.md](docs/adr/0007-worklog-notes-three-pane-redesign.md)
- Editor: [docs/adr/0010-tiptap-yjs-worklog-editor.md](docs/adr/0010-tiptap-yjs-worklog-editor.md)
