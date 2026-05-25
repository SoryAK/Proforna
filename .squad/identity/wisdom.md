---
last_updated: 2026-05-25T04:53:22.547Z
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

## Patterns

**Pattern:** Always use `codegraph_context` before reading source files. **Context:** Any time you need to understand a feature area, symbol, or file — CodeGraph answers in 2-3 calls what file-reading takes 20+ calls to discover.

**Pattern:** shadcn/ui v2 uses `@base-ui/react` — NO `asChild` prop. Use `render` prop or style triggers directly with `className`. **Context:** All UI components in this project. Applies to DropdownMenuTrigger, DialogTrigger, etc.

**Pattern:** `useEditor` (Tiptap 3) cannot accept `null` options. Gate it with an outer component that conditionally mounts the inner `useEditor` consumer. **Context:** Any Tiptap editor integration, especially the worklog editor.

**Pattern:** TanStack Query v5 `initialData` skips first fetch. Set `initialDataUpdatedAt: 0` to still trigger a background refetch. **Context:** Any query that hydrates from server props or local state.

**Pattern:** Prisma v6 (6.19.2) with `prisma-client-js` generator and standard `@prisma/client` import. DO NOT use Prisma v7 or custom output paths. **Context:** All database access in this project.

**Pattern:** Next.js 16 body size limit for Route Handlers uses `experimental.proxyClientMaxBodySize` in `next.config.ts`. `serverActions.bodySizeLimit` applies only to Server Actions, not Route Handlers. **Context:** Any API route handling file uploads.

**Pattern:** God-file limit is 600 lines. Files over 600 lines must be split into hooks + orchestrator. **Context:** Any component or file growing large — check with Modularity Auditor before adding more logic.

**Pattern:** JSON fields in Prisma models (`requiredSkills`, `skills`, `tags`, `gaps`, `estimatorSettings`) store structured arrays/objects as JSON strings. Always `JSON.parse()` on read, `JSON.stringify()` on write. **Context:** CareerPath, LearningItem, Skill, CurrentPosition, and other models with JSON columns.

**Pattern:** Every mutation on a core entity should call `logActivity(entityType, id, action, description)`. **Context:** All POST/PATCH/DELETE route handlers.

**Pattern:** OneDrive EPERM — always use `git -c gc.auto=0` for git commands. Answer "n" to all "Should I try again?" prompts. **Context:** This repo is synced via OneDrive which locks git object files.

**Pattern:** `DropdownMenuLabel` MUST be inside `DropdownMenuGroup`. For standalone section headers use `<div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">`. **Context:** All dropdown menus using shadcn/ui v2.

## Architecture

- **Stack:** Next.js 16, React 19, TypeScript strict, Prisma 6.19.2, PostgreSQL (SQLite in dev), TanStack Query v5, shadcn/ui v2 (@base-ui/react), Tiptap 3, @dnd-kit
- **File structure:** `src/app/` (pages + API routes), `src/components/` (feature components), `src/lib/` (utilities, Prisma client), `src/types/` (TypeScript types), `prisma/schema.prisma` (40+ models)
- **API pattern:** Next.js Route Handlers in `src/app/api/[feature]/route.ts`. GET/POST at collection, GET/PATCH/DELETE at `[id]`.
- **Data fetching:** TanStack Query for all client-side data. Query keys are descriptive strings. Mutations invalidate related queries.
- **Worklog path:** `src/components/worklog/` — orchestrator `worklog-page.tsx` + extracted hooks in `hooks/`
- **ADRs:** `docs/adr/` — numbered 0001+. Never edit existing ADRs; supersede with new ones.
- **Handoffs:** `docs/handoffs/YYYY-MM-DD_HHmm_handoff.md` — session continuity logs.
