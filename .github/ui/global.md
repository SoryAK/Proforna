# Resumsify Global Component Patterns

Last updated: 2026-05-25

> References tokens.md for all values. Never redefine a token here.
> These patterns apply across the entire app. Feature files reference these and extend them.

---

## Toolbar Row Pattern
Any sticky top bar (WorklogToolbar, editor toolbar, dialog header bar):

```
Container:  border-b  + tokens.surface.toolbar
Inner row:  flex items-center gap-2  + tokens.space.toolbar
Filter/secondary row:  flex flex-wrap items-center gap-2 px-3 pb-2 border-t pt-2 bg-muted/30
```

- Buttons use `button.sm` (h-7) unless it is a primary CTA
- Icons inside buttons: `icon.button` (h-3.5 w-3.5)
- Toggle buttons (filters open, select mode active): `variant="secondary"` when on, `variant="ghost"` when off
- Primary CTA (rightmost): `variant="default"` with `button.sm` or `button.lg`

---

## Empty State Pattern
When a pane or list has zero items:

```
Wrapper:  p-8 text-center
Icon:     h-10 w-10 mx-auto text-muted-foreground/50 mb-3  (tokens.icon.hero)
Message:  text-sm font-medium mb-1                          (tokens.type.body)
Hint:     text-xs text-muted-foreground mb-4               (tokens.type.meta)
CTA btn:  bg-orange-600 text-white hover:bg-orange-700 ... (tokens.brand.primary)
```

- Never show an empty state while `loading === true` — show a skeleton or spinner first.
- Only show a CTA when action is genuinely available (e.g., "Create your first note").

---

## Loading / Busy State Pattern
- Inline spinner in buttons: `<Loader2 className="h-4 w-4 animate-spin" />` — `icon.action`
- Busy button: add `disabled={isPending}` — do not manually apply grey/opacity classes
- Full-pane loading: show shimmer rows or a centered `<Loader2>` — never a blank white pane
- Mutation optimistic UI: invalidate + refetch, do not manually patch local state

---

## Destructive Action Pattern
- Warning container: `rounded-md border border-destructive/30 p-3 bg-destructive/5`
- Warning text: `text-destructive` (tokens.state.destructive)
- The destructive button must be the **last** (rightmost) button in a dialog footer
- Always require a second interaction (confirm dialog) — never delete on first press
- On success: close dialog first, then mutate (prevents stale UI flash)

---

## Badge / Chip Pattern
- Status labels: shadcn `<Badge variant="secondary">` or `<Badge variant="default">`
- Count badge on a button: `<Badge variant="default" className="h-4 min-w-4 px-1 text-[10px]">`
- Max visible label: 20 chars — use `truncate max-w-[Xpx]` beyond that
- Do NOT use raw `<span>` with hand-rolled badge styles — always use the `<Badge>` component

---

## Section Header (sidebar / rail groups)
```
text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1
```
This is `tokens.type.badge`. Use a `<div>`, never `<h*>`, for sidebar group headers.

---

## Focus & Keyboard Accessibility
- All interactive elements must be keyboard-reachable (tab order)
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Inset variant (for rows with overflow:hidden): `focus-visible:ring-inset`
- `tabIndex={-1}` only when the element has a focusable parent container
  (e.g., a checkbox inside a labeled row — the label handles tab focus)
- `aria-label` required on all icon-only buttons

## Dialog Pattern
- Use shadcn `<Dialog>` — do not roll custom modals
- Initial focus: `setTimeout(() => ref.current?.focus(), 30)` in the open effect
  (base-ui Dialog does NOT support `onOpenAutoFocus`)
- Footer layout: `flex justify-end gap-2` — Cancel left, primary CTA right
- Destructive CTA: rightmost, `variant="destructive"`

## UX Interaction Rules

These are non-negotiable behavioral standards. Apply them across every feature.

### R1 — CRUD Completeness
Every created item must expose its full lifecycle in the UI: **Edit** (if mutable),
**Delete** (with confirmation), and **Undo/Recover** where data loss is permanent.
Never ship a create flow without a corresponding remove path.

### R2 — List → Multi-Select Consideration
Any list, grid, or table of 3+ actionable items requires an explicit design decision:
*"Is bulk action meaningful here?"* If yes, implement the multi-select gate + bulk action bar.
Bulk mode is never retrofitted — decide at feature-design time.

### R3 — Empty State Completeness
Every list, grid, or table must have an explicit empty state:
- Icon: `icon.hero` (`h-10 w-10 mx-auto text-muted-foreground/50`)
- Title: `type.body` (`text-sm font-medium`)
- Hint: `type.meta` (`text-xs text-muted-foreground`)
- Primary CTA: `"Add First [Item]"` using `tokens.brand.primary`
Never show a blank pane. Never show an empty state while loading.

### R4 — Async Feedback (mandatory)
Every mutation (create, update, delete, reorder) must show all three:
1. **Loading:** disable the trigger button + show a spinner (`icon.action animate-spin`)
2. **Success:** inline confirmation or toast
3. **Error:** inline error message or toast — never silent failure
A mutation is not "done" until feedback is visible to the user.

### R5 — Destructive Clarity
The delete confirmation dialog must state *what* will be deleted and *what the consequence is*.
Example: *"Delete folder? X notes will move to Unfiled."*
Generic *"Are you sure?"* dialogs are not acceptable.
Follow the global.md Destructive Action Pattern for visual treatment.

### R6 — Form Validation Placement
- Validation errors appear **inline**, directly below the relevant field
- Required fields are visually marked (asterisk or "Required" label)
- The submit/save button is **disabled** until required fields have valid values
- Never show validation errors only in a toast

### R7 — Unbounded List Prevention
Any list that can grow beyond ~50 items must implement pagination, infinite scroll,
or virtual list before the feature ships. Never render an unbounded list in production.

### R8 — Progressive Disclosure
Keep the primary UI clean. Advanced options (filters, settings, secondary actions) live
behind a disclosure toggle or secondary panel. The default view exposes the 20% of
actions users need 80% of the time. Complexity is opt-in.

### R9 — Keyboard Parity
Every primary feature action must be keyboard-reachable (new item, delete, search, navigate).
Keyboard shortcuts must be documented in the feature's `.github/ui/[feature].md` file.
Focus management: after a modal closes, focus returns to the element that opened it.

### R10 — Touch Target Floor
All interactive elements must meet a minimum **44×44px** touch target on mobile.
Use padding to achieve this without visual bloat.
No tappable element smaller than `h-7 w-7` in any touch context.
Verify every new interactive component at the `sm:` breakpoint before shipping.
