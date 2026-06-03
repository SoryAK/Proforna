# Sidebar UI Patterns

Last updated: 2026-06-02

## Component

`src/components/sidebar.tsx` — desktop `<Sidebar>` + `<MobileHeader>`

---

## Collapse Behavior

| State | Width | Trigger |
| --- | --- | --- |
| Expanded | `w-72` | default / localStorage `sidebar-collapsed=false` |
| Collapsed | `w-14` | toggle button / localStorage `sidebar-collapsed=true` |

- Transition: `transition-all duration-200`
- State persisted to `localStorage` key `sidebar-collapsed`
- Toggle button: `ChevronLeft` (expand→collapse) / `ChevronRight` (collapse→expand), positioned `self-end mr-2 mt-2`

---

## Nav Items

| Mode | Layout | Label |
| --- | --- | --- |
| Expanded | `flex items-center gap-3 px-3 py-2.5` | shown |
| Collapsed | `justify-center px-0` | hidden (`title` attr for native tooltip) |

- Active state: → `tokens.state.selected` + `tokens.state.indicator` (`border-l-[3px]`)
- Icon size: → `tokens.icon.feature` (`h-5 w-5 shrink-0`)
- Font: `text-base font-medium`

## Jobs Accordion

- Chevron + sub-links hidden when collapsed
- Sub-links use `text-sm text-muted-foreground`, indented `ml-7 border-l pl-3`
- Sub-expansion tracks `/work-map` and `/experience/*` paths (both expand the Jobs accordion)

---

## Quick Log Trigger

- Lives in the **header row** (top bar), not the sidebar nav body
- Desktop expanded: in sidebar header, right of logo, left of Ctrl+K — shows "Quick Log" label
- Desktop collapsed: hidden (Ctrl+Shift+L shortcut still works)
- Mobile: in `MobileHeader` ml-auto strip, leftmost of the icon group
- Colors: violet surface (`bg-violet-50`, `text-violet-700`, `border-violet-200`) — NOT orange. Intentional — Quick Log is a distinct action, not a nav item.

---

## Footer

| Mode | Layout |
| --- | --- |
| Expanded | `flex items-center gap-2` row |
| Collapsed | `flex-col gap-1` stacked, centered |

- "Career Tracker v1.0" label hidden when collapsed

---

## User Card (Expanded Header)

The expanded user card header contains two compact circle icon buttons side by side:

```tsx
// Gear — Portal Settings
<button className="flex items-center justify-center h-6 w-6 rounded-full border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
  <Settings className="h-3 w-3" />
</button>
// Chevron — Collapse sidebar
<button className="flex items-center justify-center h-6 w-6 rounded-full border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
  <ChevronLeft className="h-3 w-3" />
</button>
```

- Icon size: `h-3 w-3` (`icon.inline` scale) — smaller than standard because the button itself is the visual target
- Same pattern used for collapsed avatar badge: absolute position `-top-1 -right-1`

---

## Portal Settings Dialog

Opened from the sidebar gear button. Hosts `<PortalSettingsPanel />`.

```tsx
<DialogContent className="w-[90vw] max-w-6xl sm:max-w-6xl h-[85vh] p-0 overflow-hidden flex flex-col gap-0">
```

**Critical:** `sm:max-w-6xl` must be present to override shadcn DialogContent's base `sm:max-w-sm`. Same-breakpoint utility wins in tailwind-merge — omitting it causes the dialog to render at ~384px wide.

- Layout: two-pane — `w-48 shrink-0 border-r` nav rail + `flex-1` content pane
- Both panes use `scrollbar-thin` (defined in `src/app/globals.css`)
- Sticky save footer: `shrink-0 border-t px-8 py-3 flex items-center justify-between gap-3 bg-background`
- Footer hidden when `activeSection === 'access'` (access tokens section)
- Dirty indicator in Save button: `state.dirty` token (`h-1.5 w-1.5 rounded-full bg-orange-400 inline-block`)
