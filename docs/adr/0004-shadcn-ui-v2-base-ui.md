# 0004 — Adopt shadcn/ui v2 (base-ui) over Radix

- **Status:** Accepted
- **Date:** 2026-05-17 (backfilled)
- **Deciders:** Sory Kaba
- **Tags:** frontend, ui, components

## Context and Problem Statement

Resumsify needs a large set of accessible UI primitives (Dialog, Select, Dropdown, Popover, Tabs, Tooltip, Combobox, etc.) without rebuilding accessibility behavior ourselves. We adopted shadcn/ui early for its "copy components into your repo, own the code" model.

shadcn/ui v2 swapped its underlying primitive layer from **Radix UI** to **[@base-ui/react](https://base-ui.com/)** (the Floating UI team's primitive library). This is a meaningful API change — particularly the removal of the `asChild` pattern in favor of a `render` prop.

## Decision Drivers

- Long-term maintenance — stay aligned with shadcn's official direction
- Accessibility quality of the underlying primitives
- Bundle size
- Pattern consistency across the app (we already had ~30+ shadcn components in use)

## Considered Options

- **Option A** — Migrate to shadcn/ui v2 (base-ui) as the upstream direction
- **Option B** — Stay on shadcn/ui v1 (Radix), pin versions, accept no upstream updates
- **Option C** — Move off shadcn entirely (Mantine, MUI, headless rolling our own)

## Decision Outcome

**Chosen option: "shadcn/ui v2 (base-ui)"**, because diverging from upstream means losing all future component additions and bug fixes from the shadcn registry, and base-ui's primitives are maintained by the Floating UI team with strong accessibility focus.

### Positive Consequences

- `npx shadcn add <component>` keeps working as expected
- Modern primitive layer with active maintenance
- Cleaner `render`-prop composition (more flexible than `asChild` in nested-trigger cases)

### Negative Consequences

- **API breakage** vs. Radix muscle memory: no `asChild` on `DropdownMenuTrigger` / `DropdownMenuItem` — must use `render` prop or style trigger directly with `className`
- `Select` `onValueChange` callback can receive `null` — every handler must do `v ?? fallback`
- Smaller community than Radix → fewer Stack Overflow answers
- Some third-party shadcn-extension libraries still expect Radix internals

## Pros and Cons of the Options

### Option A — shadcn/ui v2 (base-ui)

- ✅ Stays on the upstream path
- ✅ Floating UI team maintenance
- ✅ Active component additions
- ❌ Learning curve for the `render` prop pattern
- ❌ Quirks: nullable `Select` values, no `asChild`

### Option B — Stay on shadcn/ui v1 (Radix)

- ✅ No migration cost
- ✅ Largest community
- ❌ Frozen — no new components, no fixes
- ❌ Eventually forces a hard fork

### Option C — Move to Mantine / MUI / custom

- ✅ Mantine: huge component library, well-documented
- ❌ MUI: large bundle, opinionated styling
- ❌ Custom: re-implementing accessibility is a tar pit
- ❌ Loses the "own the source" benefit of shadcn

## Links / References

- [@base-ui/react docs](https://base-ui.com/)
- User memory: `~/memories/resumsify-lessons.md` "shadcn/ui v2 (base-ui)" gotchas section
