# Rex — Session History

What Rex knows about this project. Accumulated across sessions.

## Architecture Facts

- God-file limit: 600 lines. `worklog-page.tsx` was split in W1.1 into 5 hooks + orchestrator.
- ADRs live in `docs/adr/` — currently 0001–0010. Next ADR is 0011.
- Handoffs live in `docs/handoffs/` — latest is `2026-05-24_0000_handoff.md`.
- Current branch: `feature/interactive-resume-split-layout`
- W1 work (W1.1 refactor, W1.2 FTS, W1.3 bulk select) is complete and merged to main.
- Current sprint: W2 — drag-and-drop (W2.1) and inline annotations (W2.2).

## Key Decisions Made

- Prisma v6 (not v7) — v7 has ESM/adapter issues with SQLite. See ADR-0003.
- shadcn/ui v2 (@base-ui/react) — no `asChild`, use `render` prop. See ADR-0004.
- Next.js 16 + Turbopack. See ADR-0002.
- Drag-and-drop: full rail only (Popover flyout stays click-only). See roadmap.
- Search scope: when a folder is selected, search scoped to that folder + descendants.
