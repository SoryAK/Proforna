# Resumsify Worklog UI Patterns

Last updated: 2026-05-25

> References tokens.md and global.md. Never redefine tokens here.
> Feature-specific rules only — shared rules live in global.md.

---

## 3-Pane Layout

```
grid-cols-1  md:grid-cols-[200px_1fr]  xl:grid-cols-[220px_320px_1fr]
```

| Pane | Width | Ref |
|---|---|---|
| Left — Folders rail | `220px` on xl, hidden on mobile | `railPaneRef` |
| Middle — Notes list | `320px` on xl, `1fr` on md | `listPaneRef` |
| Right — Note reader | `1fr` on xl, hidden on md unless note open | `viewPaneRef` |

- Each pane: `min-h-0 overflow-hidden` to prevent scroll bleed into siblings
- Pane separator: `tokens.border.pane` (`border-r`)
- Mobile drill-down: middle pane hides when `mobileShowReader && selectedLog` — reader takes full width

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
