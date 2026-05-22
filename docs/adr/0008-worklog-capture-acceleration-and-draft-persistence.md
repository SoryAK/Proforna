# 0008 - Worklog Capture Acceleration and Draft Persistence

## Status

Proposed

## Context

After shipping the three-pane worklog redesign, the next priority was daily-entry throughput and resilience. The selected direction emphasized speed, structured tracking, and persistence by default.

The team confirmed:

- focus on speed and thoroughness of daily entries
- evolve toward a structured activity tracker
- default persistence with a 7-day retention window

## Decision

Adopt a capture-acceleration layer on top of the three-pane worklog flow:

1. Add Quick Capture in the toolbar (title, category, optional hours) with Enter-to-save behavior.
2. Add keyboard shortcuts scoped to worklog context: N for new note, / to focus search, J and K for note navigation, and Cmd/Ctrl+S to flush pending autosave fields.
3. Add default draft persistence for editor text fields with schema versioning, safe parse fallback, and 7-day TTL in local storage.
4. Add large-list performance guardrails in the note list with threshold-based progressive rendering.
5. Add optimistic updates for worklog edit mutations (especially frequent metadata updates like notable/mood/hours).

## Consequences

Pros:

- Faster capture loop for high-frequency logging days.
- Better input resilience against refresh/navigation interruption.
- Lower perceived latency from optimistic metadata updates.
- Better list responsiveness on large datasets.

Cons/Trade-offs:

- Local persistence introduces shared-device privacy considerations.
- Progressive rendering is simpler than full row virtualization and may still need a future virtualizer.
- Keyboard shortcut handling increases interaction surface and must remain carefully scoped.
- Added complexity in orchestrator and reader control plumbing (imperative flush/focus handle).
