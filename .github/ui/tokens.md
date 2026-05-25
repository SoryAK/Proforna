# Resumsify UI Tokens — Source of Truth

Last updated: 2026-05-25

> This file is the single source of truth for all design tokens.
> Feature files reference these tokens. They never redefine them.
> To add a token: append a row to the relevant table, then reference it downstream.

---

## Brand Identity
- **Primary accent:** Orange. Never use blue/indigo for primary actions in this app.
- **Brand gradient (AI avatar / logo mark):** `bg-gradient-to-br from-orange-600 to-purple-600`
- **"Private" badge on Worklog header:** `<Badge variant="secondary">Private</Badge>` — always present.

---

## Color Tokens

| Token | Light mode | Dark mode | When to use |
|---|---|---|---|
| `brand.primary` | `bg-orange-600 text-white hover:bg-orange-700` | `dark:bg-orange-500 dark:hover:bg-orange-400` | Primary CTA buttons (New, Save) |
| `brand.accent` | `text-orange-500` | `dark:text-orange-400` | Brand icons, streak indicator, highlights |
| `brand.accent-muted` | `text-orange-600` | `dark:text-orange-300` | Inline accent text labels |
| `state.selected` | `bg-orange-100 text-orange-900` | `dark:bg-orange-900/30 dark:text-orange-100` | Active folder, selected row background |
| `state.active` | `bg-orange-50 dark:bg-orange-900/20` | — | Open note row, currently-active item |
| `state.checked` | `bg-orange-100/60 dark:bg-orange-900/30` | — | Bulk-mode checkbox-selected row |
| `state.indicator` | `border-l-2 border-l-orange-500` | *(same)* | Left-rail accent on the selected row |
| `state.destructive` | `text-destructive bg-destructive/10 hover:bg-destructive/20` | `dark:bg-destructive/20 dark:hover:bg-destructive/30` | Delete actions, warning text |
| `state.destructive-border` | `border border-destructive/30` | — | Warning containers, delete dialogs |
| `state.success` | `bg-emerald-50 text-emerald-700 border-emerald-200` | `dark:bg-emerald-950/40 dark:text-emerald-300` | Success banners/toasts |
| `state.warning` | `text-amber-600` | `dark:text-amber-400` | Notable star icon, warning labels |
| `state.promote-action` | `text-amber-600 hover:text-amber-700 hover:bg-amber-50` | `dark:hover:bg-amber-950/30` | "Promote" CTA button — notable entries ready to promote |
| `state.promote-surface` | `bg-amber-50/60 border-amber-300/40` | `dark:bg-amber-950/20 dark:border-amber-700/40` | Card/banner surface for promotable-entry callouts |
| `state.promoted` | `text-emerald-700` | `dark:text-emerald-300` | Inline "Promoted" indicator — entry already promoted to career event |
| `surface.toolbar` | `bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60` | — | Sticky toolbars and top bars |
| `surface.hover` | `hover:bg-accent/40` | — | Row hover state |

---

## Button Scale

| Token | shadcn `size` prop | Height | Font | Use when |
|---|---|---|---|---|
| `button.xs` | `size="xs"` | `h-6` | `text-xs` | Micro actions inside dense rows |
| `button.sm` | `size="sm"` | `h-7` | `text-[0.8rem]` | Toolbar secondary, filter row, editor toolbar |
| `button.default` | *(omit size)* | `h-8` | `text-sm` | Standard toolbar buttons |
| `button.lg` | `size="lg"` | `h-9` | `text-sm` | Primary CTA (large contexts) |

**Variant rules:**
- `variant="ghost"` — secondary/tertiary actions with no visual weight needed
- `variant="secondary"` — active toggle state (Filters open, Select mode on, tab active)
- `variant="default"` — primary CTA only; renders in `brand.primary` color
- `variant="destructive"` — delete confirmation buttons only

---

## Icon Scale

| Token | Classes | Use when |
|---|---|---|
| `icon.inline` | `h-3 w-3` | In-text markers, metadata badges, expand chevrons |
| `icon.button` | `h-3.5 w-3.5` | Inside any `<Button>` element |
| `icon.action` | `h-4 w-4` | Standalone action icons, spinners (`animate-spin`) |
| `icon.feature` | `h-5 w-5` | Section-level icons, dialog header icons |
| `icon.hero` | `h-10 w-10` | Empty-state illustrations |

**Rule:** Never mix icon scales within the same visual context. All buttons in a toolbar row must use `icon.button`.

**Icon policy:** Use Lucide icons for all UI chrome (buttons, indicators, status). Emoji are reserved for user-facing content nodes (mood markers, shift chips) — never in toolbar buttons, labels, or action indicators.

---

## Typography Scale

| Token | Classes | Use when |
|---|---|---|
| `type.badge` | `text-[10px] font-semibold uppercase tracking-wider` | Section labels, rail group headers |
| `type.meta` | `text-xs text-muted-foreground` | Timestamps, secondary info, note previews |
| `type.meta-strong` | `text-xs font-medium` | Chip labels — small but emphatic |
| `type.body` | `text-sm` | Note titles, list item names, standard UI text |
| `type.body-muted` | `text-sm text-muted-foreground italic` | Empty/placeholder states |
| `type.heading` | `text-sm font-semibold` | Pane section headings, dialog titles |
| `type.title` | `text-xl font-semibold` | Editable note title in the reader pane |

---

## Spacing Scale

| Token | Classes | Use when |
|---|---|---|
| `space.row` | `px-3 py-2.5` | List item rows (notes) |
| `space.row-compact` | `px-2 py-1.5` | Rail items, compact sidebar rows |
| `space.toolbar` | `px-3 py-2` | Toolbar rows, header rows |
| `space.container` | `p-3` | Card-like containers, dialog inner sections |
| `space.gap-icon` | `gap-1.5` | Gap between icon and label inside a button |
| `space.gap-inline` | `gap-2` | Gap between inline sibling elements in a row |

---

## Border & Radius

| Token | Classes | Use when |
|---|---|---|
| `radius.interactive` | `rounded-md` | Buttons, inputs, folder items, badge chips |
| `radius.card` | `rounded-lg` | Cards, popovers, dropdown menus |
| `radius.pill` | `rounded-full` | Status pills, small count badges |
| `border.divider` | `border-b` | Horizontal section dividers |
| `border.pane` | `border-r` | Vertical pane separators (3-pane layout) |
| `border.accent` | `border-l-2 border-l-orange-500` | Active/selected row left indicator |
