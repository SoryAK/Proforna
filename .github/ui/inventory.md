# Resumsify Inventory UI

Last updated: 2026-06-05

> References `tokens.md` for all values. Never redefine a token here.
> Owner: `src/components/personal-inventory.tsx` (default grid + grouped-grid render path).
> Out of scope: list view, table view — they use raw shared color maps and are not governed by this file.

---

## Page Shell
- `inventory/page.tsx` renders `<PersonalInventory />` with no width cap. LayoutShell provides `p-4 sm:p-6`.
- **Never** wrap inventory in `max-w-*xl` containers. The grid is meant to scale with viewport like `/docs`.

---

## Grid Breakpoints
```
grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6
gap-3 sm:gap-4
```
- Filter sidebar defaults to **closed** (`uiPrefs.filtersOpen ?? false`). Don't restore the `?? true` default — explicit user toggles persist via localStorage.

---

## Photo-Tile / Product Card Pattern

The default grid card is photo-first. The photo block is sacred — only chrome overlays sit on it.

### Card chassis
```
overflow-hidden relative border-border/60 hover:border-foreground/30 hover:shadow-md
transition-all duration-200 p-0 gap-0 cursor-pointer
ring-2 ring-foreground/40         (when selected)
ring-2 ring-cyan-500/70           (when focused-position match)
```

### Image area
```
relative aspect-square bg-gradient-to-br from-muted/40 to-muted overflow-hidden
```

### Overlay chip — base style
All photo-overlay chips share the same chrome so they read against any image:
```
inline-flex items-center gap-1 rounded-full
bg-black/55 backdrop-blur px-2 py-0.5
text-[10px] font-medium text-white/95
ring-1 ring-white/15
```
Shorthand reference for this file: `chip.photo-overlay`.

### Slot map (per-corner)
| Slot | Purpose | Z | Notes |
|---|---|---|---|
| `top-2 left-2` (default) | Category chip — `chip.photo-overlay` + `CATEGORY_BAR_COLOR[item.category]` dot | `z-10` | Fades to `opacity-0 pointer-events-none` when `isSel || isHovered` |
| `top-2 left-2` (hover/selected) | Select checkbox | `z-20` | `opacity-0` by default, `opacity-100` when `isSel || isHovered` |
| `top-2 right-2` | Privacy lock toggle | `z-10` | `bg-white/85` when private, `bg-blue-500` when public |
| `top-2 left-1/2 -translate-x-1/2` | "Needs details" amber pill (drafts only) | `z-10` | Click opens edit modal |
| `bottom-2 left-2` | Proficiency star ribbon — `chip.photo-overlay` + `Star` icon | `z-10` | **Only** when `item.proficiency != null` |
| `bottom-2 right-2` (stacked column) | ConditionBadge + OwnershipBadge | `z-10` | **Only** non-default values (`condition !== "good"`, `ownership !== "personal"`) |
| `bottom-1.5 right/left-1.5` | Hover action bar (Edit, Duplicate, Crop, Upload, Delete, Briefcase) | `z-20` | `opacity-0 pointer-events-none` until hover; covers ribbon + badges only while in use |

**Slot-collision rule (option ii):** when two elements claim the same corner (top-left chip vs checkbox), the lower-priority element fades on the same hover/select trigger that activates the higher-priority one. Both elements stay mounted; only opacity + pointer-events shift.

### Badge readability on photos
Wrap `ConditionBadge` / `OwnershipBadge` in `<span className="rounded-full ring-1 ring-black/30 shadow-md">` when overlaying a photo. The badges' own light tints (`bg-*-500/10`) are tuned for cards, not images — the ring + shadow gives the contrast back.

---

## Default-Value Hiding Rule
Badges, ribbons, and meta rows on the grid card render **only when their value is non-default**:

| Field | Default (hidden) | Render condition |
|---|---|---|
| `condition` | `"good"` | `item.condition !== "good"` |
| `ownership` | `"personal"` | `item.ownership !== "personal"` |
| `proficiency` | `null` | `item.proficiency != null` |
| `isDraft` | `false` | `item.isDraft === true` |

This is the inventory-grid contract. The detail modal still shows everything.

---

## Info Area Below the Photo
```
p-3 flex items-end justify-between gap-2
```
- **Left:** `<h3 type.body font-semibold>` name (truncate) + manufacturer/model subtitle (`type.meta` truncate `mt-0.5`). Both use `<Highlight text={...} query={search} />`.
- **Right:** price `text-base font-bold tabular-nums leading-tight shrink-0`. Strikethrough `purchasePrice` (`text-[10px] text-muted-foreground line-through tabular-nums`) only when `currentValue !== purchasePrice`.
- **Dropped (do not re-add to default card):** category eyebrow, proficiency dots row, condition/ownership row, location/serial row, `—` placeholders, tags row. All are accessible in the detail modal or via filter/search.

---

## What Lives in the Detail Modal (not the card)
Tags, location, serial number, full proficiency control, full condition/ownership pickers (when default), purchase date, notes. Cards are scan-optimized; the modal is detail-optimized.
