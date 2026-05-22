# 0007 - Worklog Notes Three-Pane Redesign

## Status

Proposed

## Context

The prior worklog experience relied on dialog-based read/edit flows plus separate viewer and editor surfaces. In active use, this created high interaction friction for daily logging and broke the "stay in context" expectation established in the map preset workflow.

This session implemented a previously locked UX decision: convert worklog into a notes-style three-pane layout (folders rail, note list, inline reader) with save-on-blur behavior and no modal for note read/edit.

Grilling questions were not run in this step because the UX direction and behavioral constraints had already been finalized before implementation (approved sequence: agree, save-on-blur, templates as folder entry).

## Decision

Adopt a notes-app architecture for worklog with the following rules:

1. Use a three-pane layout in [src/components/worklog/worklog-page.tsx](src/components/worklog/worklog-page.tsx): folders rail, recency-grouped notes list, inline note reader.
2. Eliminate modal-based note reading/editing. Keep editing inline only.
3. Persist core text fields using save-on-blur with debounced autosave via [src/components/worklog/hooks/use-autosave.ts](src/components/worklog/hooks/use-autosave.ts).
4. Keep template management as a dedicated folder view while preserving template picker modal for "From template" quick-start.
5. Replace legacy worklog viewer/editor/timeline/filter bar files with specialized components that each own one concern.

## Consequences

Pros:

- Faster note capture and lower UX friction: users stay in one frame with immediate context.
- Better modularity: toolbar, rail, list, reader, photo section, and autosave logic are separated by responsibility.
- Improved mobile behavior: drill-in reader with explicit back transition is clearer than nested dialogs.
- Deep-link continuity: focus and new-note query params remain supported through the updated deep-link hook.

Cons/Trade-offs:

- More orchestration complexity in [src/components/worklog/worklog-page.tsx](src/components/worklog/worklog-page.tsx) due to cross-pane state coordination.
- Inline editing increases risk of unintended partial updates if autosave semantics drift from mutation behavior.
- Templates now span two entry points (folder view and quick picker), which can cause discoverability inconsistency.
- Existing tests were not expanded in this session, so regression confidence currently depends on runtime/manual validation.
