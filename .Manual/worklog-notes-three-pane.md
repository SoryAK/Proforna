# Worklog Notes Three-Pane Experience

**Status:** Shipped
**Owner:** Resumsify product/dev team
**Related ADR(s):** [0007](../docs/adr/0007-worklog-notes-three-pane-redesign.md), [0008](../docs/adr/0008-worklog-capture-acceleration-and-draft-persistence.md), [0009](../docs/adr/0009-worklog-server-backed-draft-sync.md)
**Source files:** [src/components/worklog/worklog-page.tsx](../src/components/worklog/worklog-page.tsx), [src/components/worklog/worklog-toolbar.tsx](../src/components/worklog/worklog-toolbar.tsx), [src/components/worklog/worklog-folders-rail.tsx](../src/components/worklog/worklog-folders-rail.tsx), [src/components/worklog/worklog-notes-list.tsx](../src/components/worklog/worklog-notes-list.tsx), [src/components/worklog/worklog-note-reader.tsx](../src/components/worklog/worklog-note-reader.tsx), [src/components/worklog/hooks/use-autosave.ts](../src/components/worklog/hooks/use-autosave.ts), [src/components/worklog/hooks/use-worklog-mutations.ts](../src/components/worklog/hooks/use-worklog-mutations.ts), [src/components/worklog/hooks/use-worklog-drafts.ts](../src/components/worklog/hooks/use-worklog-drafts.ts), [src/app/api/work-logs/drafts/route.ts](../src/app/api/work-logs/drafts/route.ts)

## 1. Feature Name

Worklog Notes Three-Pane Experience

## 2. Functional Description

This feature turns Worklog into a notes-style workspace so users can capture work quickly without opening and closing dialogs.

Users get:

- A left rail for folders (All notes, Notable, category buckets, Templates)
- A middle list of notes grouped by recency
- A right-side reader/editor that updates entries inline

Main user value:

- Start a note faster
- Edit while scanning previous notes
- Keep context while filtering and searching
- Capture with keyboard-first flow and Quick Capture
- Continue writing safely across refreshes/devices with draft sync
- Track overnight work correctly with shift-aware workday mapping

## 3. Internal Workflow

1. User opens Worklog page. The shell in [src/components/worklog/worklog-page.tsx](../src/components/worklog/worklog-page.tsx) loads logs/templates/lookup data using existing hooks.
2. User picks a folder in the left rail from [src/components/worklog/worklog-folders-rail.tsx](../src/components/worklog/worklog-folders-rail.tsx). The shell maps folder state to category/notable filters.
3. User searches or applies filters in [src/components/worklog/worklog-toolbar.tsx](../src/components/worklog/worklog-toolbar.tsx). The shell computes the visible list.
4. User can open Quick Capture in [src/components/worklog/worklog-toolbar.tsx](../src/components/worklog/worklog-toolbar.tsx), enter title/category/optional hours, and press Enter or Save to create a note immediately.
5. User can use keyboard shortcuts in [src/components/worklog/worklog-page.tsx](../src/components/worklog/worklog-page.tsx): N (new), / (focus search), J/K (navigate), Cmd/Ctrl+S (flush autosave).
6. User selects a note from [src/components/worklog/worklog-notes-list.tsx](../src/components/worklog/worklog-notes-list.tsx). The selected note id drives the right pane.
7. User edits in [src/components/worklog/worklog-note-reader.tsx](../src/components/worklog/worklog-note-reader.tsx):

- Title/content/tags/hours use debounced local state via [src/components/worklog/hooks/use-autosave.ts](../src/components/worklog/hooks/use-autosave.ts), then flush on blur.
- The same fields are persisted locally and written through to server drafts via [src/components/worklog/hooks/use-worklog-drafts.ts](../src/components/worklog/hooks/use-worklog-drafts.ts).
- Reader hydration is server-first with local fallback when server draft values are absent.
- Date/category/position/mood/notable/tools/assets update immediately through existing mutation paths.
- Date + time are now editable, and users can attach a reusable job shift to each log.
- If a selected shift crosses midnight (example: 23:00-07:00), logs after midnight map to the previous shift workday for historical tracking.

8. User can create reusable per-job shifts inline in the reader (name + start/end time). These are persisted to `/api/work-history/[id]/shifts` and can be reused across future logs for that job.
9. User can also manage shifts from job detail screens (Current Position and Experience Detail) via a dedicated Shift Templates card (create/edit/delete), so shift setup is not limited to the worklog reader.
10. User can configure account-synced Worklog defaults (default company, default shift, category, mood, hours) from the Worklog toolbar. These defaults apply to all new notes, including quick capture and deep-link creation flows, and are automatically ignored when the selected default shift is no longer valid for the default company.

1. User adds or removes photos inside [src/components/worklog/worklog-photo-section.tsx](../src/components/worklog/worklog-photo-section.tsx), which handles photo query, upload, and delete.
2. Optimistic edit updates in [src/components/worklog/hooks/use-worklog-mutations.ts](../src/components/worklog/hooks/use-worklog-mutations.ts) update visible note metadata quickly, then background revalidation keeps data authoritative.
3. For very large note sets, [src/components/worklog/worklog-notes-list.tsx](../src/components/worklog/worklog-notes-list.tsx) progressively renders additional chunks while scrolling.

## 4. Configuration/Params

| Name | Location | Default | Purpose |
| ---- | -------- | ------- | ------- |
| `compact` | [src/components/worklog/worklog-page.tsx](../src/components/worklog/worklog-page.tsx) | `false` | Tight embedded layout for map preset mode vs standalone page |
| `debounceMs` | [src/components/worklog/hooks/use-autosave.ts](../src/components/worklog/hooks/use-autosave.ts) | `800` | Debounce delay before autosave commit |
| `persistTtlMs` | [src/components/worklog/hooks/use-autosave.ts](../src/components/worklog/hooks/use-autosave.ts) | `7 days` | Default local draft persistence retention |
| Server draft TTL | [src/app/api/work-logs/drafts/route.ts](../src/app/api/work-logs/drafts/route.ts) | `7 days` | Expiration policy for cross-device draft rows |
| Folder selection state | [src/components/worklog/worklog-page.tsx](../src/components/worklog/worklog-page.tsx) | `{ kind: "all" }` | Determines active notes bucket and template view |
| Mobile reader state | [src/components/worklog/worklog-page.tsx](../src/components/worklog/worklog-page.tsx) | `false` | Controls drill-in reader/back navigation on narrow screens |
| Deep link params | [src/components/worklog/hooks/use-worklog-deep-links.ts](../src/components/worklog/hooks/use-worklog-deep-links.ts) | n/a | Supports `focus`, `focusPosition`, `focusEquipment`, `focusAsset`, `new` behaviors |
| `VIRTUALIZE_THRESHOLD` | [src/components/worklog/worklog-notes-list.tsx](../src/components/worklog/worklog-notes-list.tsx) | `250` | Turns on progressive rendering for very large lists |
| `PAGE_SIZE` | [src/components/worklog/worklog-notes-list.tsx](../src/components/worklog/worklog-notes-list.tsx) | `120` | Number of additional rows rendered per chunk |
| `WorkLog.workdayDate` | [prisma/schema.prisma](../prisma/schema.prisma) | derived | Shift-aware logical workday used for overnight shift grouping |
| `WorkHistoryShift.startMinute/endMinute` | [prisma/schema.prisma](../prisma/schema.prisma) | n/a | Reusable per-job shift windows (supports overnight shifts) |

## 5. Known Constraints

- Does not remove template modal editing; templates are still configured in a modal editor.
- Does not include expanded automated test coverage for the new pane interaction model in this session.
- Does not guarantee visual parity on all edge viewport combinations without additional runtime tuning passes.
- Does not yet provide manual conflict resolution UI; draft conflicts use last-write-wins behavior.
- Does not yet use a dedicated virtualizer library; progressive rendering is a lightweight interim approach.
- Shift-to-workday mapping currently uses local client date/time semantics; if a user logs from a timezone different from the job's actual location timezone, manual review may still be needed for edge cases.
