# Resumsify Worklog UI Patterns

Last updated: 2026-06-06 (ADR-0014 — worklog home route split)

> References tokens.md and global.md. Never redefine tokens here.
> Feature-specific rules only — shared rules live in global.md.

---

## Routes (post-ADR-0014)

The worklog feature has two surfaces under a shared `(app)/worklog/layout.tsx`:

| Route | Page | Purpose |
|---|---|---|
| `/worklog` | [`<WorklogHomeView>`](../../src/components/worklog/home/worklog-home-view.tsx) | Capture-first home — read-only glance + Quick Capture |
| `/worklog/notes` | [`<WorklogPage>`](../../src/components/worklog/worklog-page.tsx) | 2-pane list+reader (the working surface) |

The layout file mounts [`<FullBleedShell>`](../../src/components/full-bleed-shell.tsx) once for both routes. The sidebar override from ADR-0013 gates on `pathname.startsWith("/worklog")` so it covers both pages without changes.

---

## `/worklog` home — section composition

```
WorklogHomeView
├─ Greeting + summary line          ("Friday, June 6 · 5-day streak · 27 notes …")
├─ WorklogQuickCapture              hero: title + chip + Save → /worklog/notes?focus=<id>
├─ WorklogTodayList                 one-liner list of today's notes
├─ WorklogStatCards                 streak / month / notable (3-card row)
├─ WorklogFolderGrid                top 8 folders by recent activity + Templates tile
└─ WorklogRecentList                "Earlier this week" one-liner list (max 8)
```

- All sections live under `src/components/worklog/home/`. One section per file.
- Home view is **read-only**: no internal state, no URL params consumed. Every interaction either creates a note (Quick Capture) or routes to `/worklog/notes?…`.
- Quick Capture submit (ADR-0014 G2 = option B): calls `POST /api/work-logs` directly, then `router.push("/worklog/notes?focus=<id>")`. The existing `useWorklogDeepLinks` hook on the notes page consumes `?focus` and brings the reader into focus.
- Today / Recent rows reuse the same one-liner shape: category dot · title · optional notable star · preview · time. Density-first per G1 decision.
- Folder grid limits to **top 8 by recent activity** (most-recent note timestamp). Iterate on this number based on real use; the 8 limit is intentional, not sacred.

---

## `/worklog/notes` — 2-pane list+reader

```
grid-cols-1 md:grid-cols-[320px_1fr]
```

| Pane | Width | Ref | Owner |
|---|---|---|---|
| Left — Notes list | `320px`, `1fr` on mobile | `listPaneRef` | `WorklogPage` |
| Right — Note reader | `1fr` on md+, hidden on mobile unless note open | `viewPaneRef` | `WorklogPage` |

- The activity widget no longer mounts here (ADR-0014). It lives only on `/worklog`.
- Notes list pane is the focused surface for scanning + selecting; reader is the focused surface for editing.

### Compact embed (`<WorklogPage compact />`)

Unchanged from ADR-0013. 3-pane grid `md:grid-cols-[200px_1fr] xl:grid-cols-[220px_320px_1fr]` with internal [`<WorklogFoldersRail>`](../../src/components/worklog/worklog-folders-rail.tsx) and its own `<WorklogDndProvider>`. The compact variant cannot claim the global sidebar so it keeps the rail.

### URL contract (folder selection — ADR-0013)

Applies to `/worklog/notes` only. The home page consumes no URL state.

| Param shape | Selection |
|---|---|
| (none) or `?folder=all` | `{ kind: "all" }` |
| `?folder=notable` | `{ kind: "notable" }` |
| `?folder=unfiled` | `{ kind: "unfiled" }` |
| `?folder=category:<key>` | `{ kind: "category", category }` |
| `?folder=<cuid>` | `{ kind: "folder", folderId }` |
| `?view=templates` | `{ kind: "templates" }` (overrides folder) |
| `?focus=<id>` | Open the reader on a specific note (ADR-0014, used by Quick Capture handoff) |

Both `<WorklogPage>` and `<WorklogNavSidebar>` read through [`useFolderSelection()`](../../src/components/worklog/hooks/use-folder-selection.ts). Setter uses `router.push` so back/forward navigates folders. `<WorklogPage compact />` calls `useFolderSelection({ enabled: false })` to fall back to local state. **Cross-route navigation** (clicking a filter row from `/worklog`) uses `selectionToQueryString()` + an explicit `router.push("/worklog/notes?...")` — the hook's setter is bound to the current pathname.

---

## Sidebar (post-ADR-0014)

The override sidebar shows:

1. **Header** — back-arrow (collapse) + "Worklog" link to home
2. **Home row** — `<Link href="/worklog">` active when `pathname === "/worklog"`
3. **All notes / Notable / Templates** — filter rows; active state ONLY while on `/worklog/notes`
4. **Folders** (drag-droppable tree)
5. **Categories** (collapsible group)

Filter / folder / category clicks navigate **to** `/worklog/notes` when triggered from the home page (cross-route). When already on `/worklog/notes`, they only mutate the URL params via the hook's setter. Same component, two behaviors.

---

## Pane separators

- All panes: `min-h-0 overflow-hidden` to prevent scroll bleed into siblings
- Pane separator: `tokens.border.pane` (`border-r`)
- Mobile drill-down: notes-list pane hides when `mobileShowReader && selectedLog` — reader takes full width

---

## Note Row Anatomy

```
<li
  role="option"
  className="cursor-pointer border-b px-3 py-2.5 flex items-start gap-2
    {isActive  → bg-orange-50 dark:bg-orange-900/20 border-l-2 border-l-orange-500}
    {!isActive → hover:bg-accent/40 border-l-2 border-l-transparent}
    {isChecked → bg-orange-100/60 dark:bg-orange-900/30}"
>
  {/* 1. Checkbox label   — bulk mode only, h-5 w-5 hit target            */}
  {/* 2. Category icon    — icon.button (h-3.5 w-3.5) text-muted-foreground */}
  {/* 3. Title            — type.body (text-sm font-medium) truncate       */}
  {/* 4. Notable star     — h-3 w-3 text-amber-500 fill-current           */}
  {/* 5. Timestamp        — text-[10px] text-muted-foreground tabular-nums */}
  {/* 6. Preview          — type.meta line-clamp-2 leading-relaxed        */}
  {/* 7. Meta row         — text-[11px] text-muted-foreground (folder/tag) */}
</li>
```

- Active (open) note: `tokens.state.active` background + `tokens.state.indicator` left border
- Checked (bulk-selected): `tokens.state.checked` background overlay
- Rows use `border-b` only (horizontal divider) — no card borders, no border-l unless active

---

## Bulk Mode Rules

- **Activation:** "Select" button in WorklogToolbar toggles `bulkMode` state in `worklog-page.tsx`
- **bulkMode ON:** `selection={selection}` + `sortable={false}` passed to WorklogNotesList
- **bulkMode OFF:** `selection={undefined}` — no checkboxes rendered in the DOM at all
- **DnD and bulk mode are mutually exclusive** — never both active simultaneously
- **Row click in bulk mode:** toggles selection AND opens the note (both fire)
- **Exit paths:** click "Select/Done" button again, or press Escape
- **WorklogBulkActionBar "Clear":** clears selection only — does NOT exit bulk mode
- Checkbox visibility: `opacity-100` when `selectedCount > 0`, else `opacity-0 group-hover:opacity-60`

---

## Folder Tree Pattern

- Rail width: `220px` (xl breakpoint), hidden on mobile
- Folder item spacing: `tokens.space.row-compact` (`px-2 py-1.5`)
- Selected folder background: `tokens.state.selected`
- Folder indentation: `pl-{depth * 3}` — max depth 8 (`FOLDER_MAX_DEPTH` constant)
- Expand/collapse chevron: `icon.inline` (`h-3 w-3`) rotates 90° when open
- DnD drop target indicator: `ring-1 ring-ring bg-accent/30` (use `DND_DROP_TARGET_CLASS` constant)
- DnD dragging row: `opacity-40` (use `DND_ACTIVE_ROW_CLASS` constant)
- DnD and bulk mode: DnD enabled only when `!bulkMode`

---

## Worklog Toolbar Specifics

Follows global.md Toolbar Row Pattern, plus:

- **Title area:** `text-sm font-semibold` + `<Badge variant="secondary">Private</Badge>` — always present
- **Search input:** `h-8 pl-7 pr-7 text-sm` with absolute `Search` icon at `icon.button` size
- **Select toggle button:** `button.sm`, `variant="secondary"` when active, `variant="ghost"` when inactive;
  shows "Select" (inactive) or "Done" (active); icon `CheckSquare` at `icon.button`
- **Right actions group:** `ml-auto flex items-center gap-1.5`
- **"New" button:** `button.sm` + `variant="default"` — the only primary CTA in the toolbar
- **All other toolbar buttons:** `button.sm` + `variant="ghost"` (or `"secondary"` when toggled on)

---

## Canvas Block Pattern

The `canvasBlock` Tiptap node renders inside the prose editor as a self-contained block.

```
<figure> rounded-lg border border-border overflow-hidden bg-background not-prose
  Header bar:  flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30
    PenLine icon  →  icon.inline (h-3 w-3)
    Title         →  text-xs font-medium text-muted-foreground (type.meta-strong)
    Edit button   →  button.xs (h-6 px-2) + Pencil icon  →  icon.inline
    Delete button →  button.xs (h-6 w-6) + Trash2 icon   →  hover:text-destructive
  Preview area:  cursor-pointer (editable), height 280px
    Empty state:  PenLine h-8 w-8 opacity-25 + "Click to start drawing" text-sm
    With content: <CanvasThumbnail> (TldrawImage SVG)
  Full-screen dialog: max-w-full w-screen h-[100dvh] rounded-none border-0
```

- No emoji in any canvas UI element — Lucide icons only (→ tokens.md Icon policy).
- tldraw CSS (`@tldraw/tldraw/tldraw.css`) is lazy-loaded with the component chunk.
- Canvas state travels through the existing `onSave` → `contentJson` path.
- Read-only note view (`worklog-note-view.tsx`) shows a compact title-bar placeholder.

- Editable title: `text-xl font-semibold` inline input → `tokens.type.title`
- Editor toolbar buttons: `h-7 px-2 gap-1 text-xs` (micro size, not standard toolbar)
- Autosave indicator: subtle, non-disruptive — never a full banner for autosave success
- Empty state (no note selected): follow global.md Empty State Pattern with worklog-appropriate copy

---

## Inline Mention Chip Pattern

Used in the Tiptap editor (edit mode `mention-node-view.tsx`) and the static reader (`worklog-note-view.tsx`).

```
<span class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 mx-0.5
             text-xs font-medium align-middle cursor-default select-none
             {mention.<entityType>}  ← from tokens.md
             {selected → ring-2 ring-ring ring-offset-1}
             {broken   → opacity-50 line-through decoration-red-400}">
  <span class="font-bold opacity-70 text-[10px]">{badge letter}</span>
  {label}
</span>
```

- Color comes **exclusively** from `tokens.mention.*` — never inline raw Tailwind.
- Badge letters: `A` (asset), `S` (skill), `C` (company), `P` (person/contact).
- `broken` state (entity deleted): `opacity-50` + `line-through` — checked via `GET /api/work-logs/mention-search?type=X&id=Y`.
- Suggestion popup: `fixed z-[9999]` floating overlay, `min-w-[220px] max-w-xs rounded-lg border bg-popover shadow-lg`. Triggered by `@` in the editor.
- Auto-populate rule: on every `contentJson` save the server unions `@a:` mention IDs into `WorkLog.assetIds` (additive only — never removes manually-tagged assets).

---

## Promotion State Patterns (Phase D)

Two distinct visual states for notable worklog entries:

### "Ready to Promote" button
```
<Button variant="ghost" className="h-8 px-2 gap-1 {state.promote-action}">
  <Trophy className="h-3.5 w-3.5" />    {/* icon.button */}
  <span className="text-xs font-medium hidden sm:inline">Promote</span>
</Button>
```
- Only rendered when: `log.isNotable && log.positionId && !log.promotedToCareerEventId`
- Uses `state.promote-action` token — never raw amber values
- Trophy icon at `icon.button` scale (`h-3.5 w-3.5`)
- Text label hidden on mobile (`hidden sm:inline`)

### "Already Promoted" inline indicator
```
<span className="inline-flex items-center gap-1 px-2 h-8 rounded text-xs font-medium {state.promoted}">
  <Trophy className="h-3.5 w-3.5" /> Promoted
</span>
```
- Replaces the Promote button once `log.promotedToCareerEventId` is set
- Not a Badge component — it's an inline span to match the button's height in the action row
- Uses `state.promoted` token

### Promotable-entries banner card (position-worklog-tab)
```
<Card className="p-3 border {state.promote-surface}">
  {/* Trophy icon + count header, then one row per unpromoted notable entry */}
</Card>
```
- Only visible when `unpromoted.length > 0`
- Uses `state.promote-surface` token for background and border
- Per-entry Promote button uses `variant="outline"` with `state.promote-action` classes (outline variant in this context only)
