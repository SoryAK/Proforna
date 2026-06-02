# Resumsify Job Map UI Patterns

Last updated: 2026-05-26

> Status: Partially codified — patterns added as they are built.

---

## Panel Settings
- Trigger: "Panel settings" item inside the `...` (MoreHorizontal) menu in the WorkHistoryPanel header.
- Pattern: **Centered `<Dialog>`** (`sm:max-w-md`, `gap-0 p-0 overflow-hidden`), not a corner popover.
- Header: `<DialogHeader className="px-4 pt-4 pb-3 border-b">` with `<DialogTitle className="text-sm">`.
- Body: `<div className="px-4 py-4 space-y-4 overflow-y-auto max-h-[65vh] scrollbar-thin">`.
- Display toggles: **3-column icon tile grid** (`grid grid-cols-3 gap-2`). Each tile: icon + label + On/Off state. Active tiles use feature-specific accent (`border-blue-500/40 bg-blue-500/10` for Career Path, `border-cyan-500/40` for Concurrent, `border-primary/40` for Timeline).
- Stat Slots: **2-column chip grid** per group (`grid grid-cols-2 gap-1`). Selected chip: `bg-primary/10 text-primary border-primary/30`. Shows `#N` slot order when selected.

## Action Bar (Work Mapping mode)
- Location: below the resize handle, visible only when `showWorkHistory` is true.
- Tool buttons: `size="sm" h-7 text-xs`. Toggle buttons use `variant={active ? "default" : "outline"}`.
- Map Style button: cycles Roadmap → Satellite → Hybrid → Roadmap. Shows current style as label. Active (`variant="default"`) on Satellite or Hybrid; outline on Roadmap (default).
- Tile styles: `"google-roadmap"` (default) | `"google-satellite"` | `"google-hybrid"`. OSM removed — was a duplicate of roadmap.

## TODO (capture when first built)
- Map overlay panel anatomy (position, width, z-index, backdrop)
- Job pin / marker style (active vs inactive state)
- Polygon right-click context menu pattern (see ADR for right-click implementation notes)
- Preset hot-swap controls (see ADR 0006)
- Mobile map interaction pattern
