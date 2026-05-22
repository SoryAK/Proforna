# 0009 - Worklog Server-Backed Draft Sync

## Status

Proposed

## Context

Phase 1 introduced local draft persistence and accelerated capture behavior. The next requirement was cross-device continuity with default persistence while keeping typing latency low.

The team selected:

- local-first write-through sync for responsiveness
- last-write-wins conflict strategy by updated timestamp
- 7-day draft retention

## Decision

Implement server-backed field-level worklog drafts with local-first write-through:

1. Add a new WorkLogDraft persistence model keyed by user, note, and field.
2. Add draft API endpoints under /api/work-logs/drafts for load, upsert, and clear.
3. Hydrate reader fields server-first, then local fallback if server has no draft value.
4. Write drafts in the background while typing and clear corresponding draft fields after successful note commits.
5. Enforce 7-day TTL server-side and keep last-write-wins conflict behavior by updated timestamp.

## Consequences

Pros:

- Cross-device draft continuity for in-progress notes.
- Better resilience against refreshes/navigation while editing.
- Fast typing UX preserved through local-first behavior.
- Draft lifecycle is explicit and bounded by retention policy.

Cons/Trade-offs:

- Additional database write volume from draft sync activity.
- Eventual consistency window between local and server states.
- New API/model surface area requires more testing coverage.
- Last-write-wins can overwrite parallel edits made from multiple devices.
