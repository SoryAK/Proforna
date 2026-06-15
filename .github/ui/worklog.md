# Resumsify Worklog UI Patterns

Last updated: 2026-06-15 (ADR-0027 Day 3 Cycle A — Events sibling route + nav row)

> References tokens.md and global.md. Never redefine tokens here.
> Feature-specific rules only — shared rules live in global.md.

---

## Routes (post-ADR-0027 Day 3 Cycle A)

The worklog feature has four surfaces under a shared `(app)/worklog/layout.tsx`:

| Route | Page | Purpose |
|---|---|---|
| `/worklog` | [`<WorklogHomeView>`](../../src/components/worklog/home/worklog-home-view.tsx) | Capture-first home — read-only glance + Quick Capture |
| `/worklog/notes` | [`<WorklogNotesView>`](../../src/components/worklog/worklog-notes-view.tsx) | Document-manager list/grid + drawer preview (working surface) |
| `/worklog/notes/[id]` | [`<WorklogNoteReader>`](../../src/components/worklog/worklog-note-reader.tsx) | Full-screen single-note reader/editor |
| `/worklog/events` | [`<WorklogEventsView>`](../../src/components/worklog/worklog-events-view.tsx) | CareerEvent sibling surface — anchored + free-floating (ADR-0027). Cycle A ships the skeleton + nav; Cycle B adds the list, filter chips, and drawer. |

The layout file mounts [`<FullBleedShell>`](../../src/components/full-bleed-shell.tsx) once for all worklog routes. The sidebar override from ADR-0013 gates on `pathname.startsWith("/worklog")` so it covers every worklog page — including `/worklog/events` — without changes.

### Nav row hierarchy (ADR-0027 Day 3 Cycle A)

The worklog sidebar's filter rows route to `/worklog/notes?…` (scoped filters on the current page). The Events row is the first row that routes elsewhere — to its own sibling page. To signal that difference visually without shouting, Events uses the same `NavRow` typography but adds `border.divider-top` (a hairline `border-t` from tokens.md) above the row. Layout order:

```
Home  →  All notes  →  ─── Events ───  →  Archived  →  Notable  →  Templates
                          ↑ divider above signals "different destination"
```

Active state mirrors `NavRow`: `bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100` when `pathname === "/worklog/events"`.

---

## Reader Drawer (ADR-0015 Phase 5)

Clicking any row on `/worklog/notes` opens a **read-only preview drawer**, not the full editor. Editing is a deliberate escalation via the drawer's "Open" button, which routes to the full-screen `/worklog/notes/[id]`.

### URL contract

| URL | State |
|---|---|
| `/worklog/notes` | Drawer closed |
| `/worklog/notes?focus=<id>` | Drawer open in **read** mode for `<id>` |
| `/worklog/notes?focus=<id>&new=1` (optional) | Drawer open in edit mode (Quick Capture handoff). `new=1` is one-shot, stripped after first render |
| `/worklog/notes/[id]` | Full-screen reader (Edit button on drawer routes here) |
| `/worklog/notes?folder=…&view=…&focus=<id>` | Drawer open with all unrelated filter params preserved |

- **Setter:** `router.replace(href, { scroll: false })` — never `push`. Back-button escapes the whole preview model, not individual previews.
- **Param hygiene:** `buildNotesUrl()` and `drawerOpenHref()` round-trip via `URLSearchParams` so unrelated deep-link params survive every interaction.
- **Delete from drawer:** close drawer first (clear `?focus`), then fire the delete mutation. Otherwise the drawer flashes a "not found" state while `router.replace` is still committing.

### Layout dimensions

```
/* Mobile (< md) */               /* Desktop (md+) */
fixed inset-0                     fixed md:inset-y-0 md:right-0
                                  md:w-[min(600px,50vw)]
transform translate-x-full ↔ translate-x-0
transition-transform duration-200 ease-out
```

- **Mobile = full sheet.** Drawer occupies the whole viewport.
- **Desktop = right rail.** `min(600px, 50vw)` so on narrow desktops the drawer caps at 50% of the viewport, on wide desktops at 600px.
- **No Dialog primitive.** Plain styled container + Esc handler. Dialog's focus-trap and body-scroll-lock fight "list still interactive while drawer is open" — keyboard arrow-nav must keep working.
- **Animation:** 200ms `ease-out`. Slower feels sluggish, faster feels janky.

### Drawer chrome

- **Header (left → right):** ✕ close, "Open" link to full-screen route, kebab menu (Delete, …future actions).
- **Body branches:** spinner / empty-state / `<WorklogNoteReadView>`.
- **No data fetching inside the drawer.** Receives the row object as a prop, reads from the same TanStack Query cache that backs the list.

### Full-screen route

- `max-w-5xl mx-auto px-4` for prose. **Not** `max-w-3xl` — feels cramped on modern monitors with the document-manager-style title chrome.
- `backHref` reconstructed from current search params so the back-arrow preserves filter context.
- Same read-only renderer (`<WorklogNoteReadView>`) is used in both the drawer and the full-screen route.

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

## `/worklog/notes` — document-manager list/grid + drawer (post-ADR-0015 Phase 5)

The page is a single full-width content area with a list/grid toggle, sortable headers, filter chip row, and bulk action bar. The reader is now a drawer (see section above), not a permanent right pane. The activity widget lives only on `/worklog` (ADR-0014).

- **List/Grid toggle** — view-mode radiogroup with full ARIA keyboard nav (roving tabindex, arrow keys, Home/End, wrap). Persists to `resumsify:documents:view-mode`.
- **Sort menu** — DropdownMenu in toolbar, applies to both list and grid views.
- **Bulk action bar** — replaces toolbar when `selectedCount > 0`. Accepts a `trailing` slot so view-mode + sort stay visible during bulk.
- **Row click** — sets `?focus=<id>` via `router.replace`. Drawer slides in.

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

---

## Version History Panel + Diff Modal (ADR-0017)

The full-screen reader (`/worklog/notes/[id]`) mounts a read-only timeline of past versions for the note, plus a "View diff" modal and a "Restore" confirm dialog.

### Mount surfaces (asymmetric vs Backlinks)

| Surface | History panel | Backlinks panel |
|---|---|---|
| Drawer (`<WorklogNoteReadView>`) | **NOT mounted** | Mounted |
| Full-screen (`<WorklogNoteReader>`) | Mounted (after Backlinks) | Mounted |

The drawer is a quick preview tier — keep its surface area minimal. History is a "deliberate" affordance and only shows up on the focus tier.

### Panel structure

```
<aside className="border rounded-lg p-4 space-y-3">
  <header>type.body-strong "Version history"</header>
  {bucketsInOrder.map(([bucket, rows]) => (
    <section>
      <h3>type.meta-strong  e.g. "Today" / "Yesterday" / "Earlier this week" / "Older"</h3>
      <ul role="list">
        {rows.map(row => <VersionRow ... />)}
      </ul>
    </section>
  ))}
  {empty → "No versions yet — snapshots appear as you edit."}
</aside>
```

- Bucket labels: `Today`, `Yesterday`, `Earlier this week`, `Older`. Empty buckets are NOT rendered.
- Hides while `isLoading` to avoid layout shift (matches backlinks panel).

### Version row anatomy

```
<li className="flex items-start gap-2 py-2 border-b last:border-b-0">
  {/* Header line */}
  <div className="flex items-baseline gap-2">
    <span>type.body-strong   label-or-"Auto"</span>
    <span>type.meta          formatTime(createdAt)</span>
    <span>type.meta tabular-nums  charDelta colorized:
      delta > 0 → text-emerald-600 dark:text-emerald-400  prefix "+"
      delta < 0 → text-red-600 dark:text-red-400         (delta keeps minus sign)
      delta = 0 → text-muted-foreground                  prefix "±"
    </span>
  </div>
  <p>type.meta line-clamp-2  plainTextPreview</p>
  <div className="flex gap-2 mt-1">
    <Button variant="ghost" size="sm">View diff</Button>
    <Button variant="ghost" size="sm">Restore</Button>
  </div>
</li>
```

- `charDelta` colors are **inline raw Tailwind**, not tokenized. They're a one-off signed-delta visualization, not a reusable surface. If a second feature wants the same colors, promote to a `state.delta-*` token then.
- Both buttons are `variant="ghost"` — restore is the higher-stakes action but the dialog is the gate, not the button color.

### Restore confirm dialog (NOT `window.confirm`)

```
<Dialog open={pendingRestore !== null} onOpenChange={open => !open && setPendingRestore(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Restore this version?</DialogTitle>
      <DialogDescription>
        Snapshot from {formatTime(pendingRestore.createdAt)}. This is reversible —
        a "Before restore from <ts>" snapshot of the current state is taken first.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="ghost" onClick={cancel}>Cancel</Button>
      <Button onClick={confirm} disabled={mutation.isPending}>
        {mutation.isPending ? "Restoring…" : "Restore version"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- **Never use `window.confirm()`** — Next.js 16 + React 19 dev throws `Error: confirm() is not supported.` Same for `window.prompt`/`window.alert`. Always use the controlled base-ui Dialog from `@/components/ui/dialog`.
- Confirm button uses default variant (primary). The destructive look is unwarranted — restore is REVERSIBLE because the pre-snapshot is taken first.

### Diff modal

```
<Dialog open={open} onOpenChange={open => !open && onClose()}>
  <DialogContent className="max-w-3xl">
    <DialogHeader>
      <DialogTitle>{label} · {formatTimestamp(version.createdAt)}</DialogTitle>
      <DialogDescription>
        Showing changes from this snapshot to the current document.
        Green additions, red removals.
      </DialogDescription>
    </DialogHeader>
    <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed">
      {segments.map(seg => (
        <span className={
          seg.kind === "add"    ? "bg-emerald-100 dark:bg-emerald-900/30" :
          seg.kind === "remove" ? "bg-red-100 line-through dark:bg-red-900/30" :
          ""
        }>
          {seg.text}
        </span>
      ))}
    </div>
  </DialogContent>
</Dialog>
```

- Diff highlight colors are **inline raw Tailwind**, intentionally not tokenized. Same one-off rationale as `charDelta` colors. If a second diff surface ships, promote to `state.diff-add`/`state.diff-remove` tokens.
- `max-w-3xl` because the diff is plain-text — wider would feel sparse with monospace.
- Body uses `whitespace-pre-wrap font-mono` so newlines and horizontal whitespace are preserved (the tokenizer keeps them as separate diff tokens too).

### Save Version button (toolbar)

The Tiptap editor toolbar gains a `BookmarkPlus` icon button when `workLogId` is provided:

```
<Button variant="ghost" size="sm" onClick={() => setLabelDialogOpen(true)}>
  <BookmarkPlus className="h-3.5 w-3.5" />
  <span className="text-xs hidden sm:inline">Save version</span>
</Button>
```

- Only renders when `workLogId` prop is truthy. Other editor surfaces (if added later) can mount the toolbar without it and the button stays hidden.
- Click opens a controlled Dialog with an optional label `<Input maxLength={80} autoFocus />`. Enter submits, Escape cancels.
- Empty label is allowed (server stores `null`).
- Sits next to the existing toolbar buttons, NOT in a separate cluster.
