# Worklog Version History + Visual Diff

- **Status:** Accepted (2026-06-09 — sprint kickoff)
- **Date:** 2026-06-07
- **Deciders:** Sory
- **Tags:** worklog, editor, schema, ux
- **Related:** [ADR-0010](./0010-tiptap-yjs-worklog-editor.md), [ADR-0015](./0015-worklog-notes-document-manager.md), [ADR-0016](./0016-note-to-note-linking-and-backlinks.md)

## Sprint Kickoff Notes (2026-06-09)

Three Griller questions resolved before implementation:

1. **Edit-distance metric for the auto-snapshot heuristic.** Use `Math.abs(currentPlainText.length - prevPlainText.length)` (length-delta) for v1. True Levenshtein is O(n·m) and would fire on every save — the trigger only needs "did the document change meaningfully?" not "exact edit count." Length-delta misses pure substitutions (replace word A with word B of same length), which is acceptable for v1: the 30s idle timer + 50-char threshold catches all realistic typing sessions, and a manual "Save version" button covers the rare "I rewrote a paragraph in place" case. If false negatives become a real complaint, swap in `fast-levenshtein` later.
2. **Retention job execution timing.** Inline-on-save with an early-exit guard. Single-user app + no scheduled-job infrastructure means cron is over-engineering. The guard: skip thinning if `lastSnapshotAt < 1h ago AND auto-snapshot count for this note in the last hour < 10` — the cap matches the tier-1 retention budget, so we only run the thinning query when there's actually something to thin.
3. **Y.js connected-sessions warning on restore.** Skip for v1. The "active connections > 1" guard solves a problem that doesn't exist today — there is no Y.js network provider, only IndexedDB persistence (parked: see `parked-ideas.md` → Yjs network provider). Restore today affects only the device performing it; other devices pick up the new state next time they hit the server. Adding a guard now would be cargo-culting from the ADR's defensive-architecture section. Re-add when the network provider sprint lands.

## Context and Problem Statement

The user asked: "I want to treat notes not just like Obsidian but also like git — edit history, updates, merge capabilities…"

That instinct is right *in spirit* and wrong *in metaphor*. Personal worklog notes need **time travel** (see what a note looked like yesterday, restore an old version). They do **not** need git's coordination machinery (branches, manual merge, rebase, blame) because:

1. Notes are single-author. Blame and concurrent-write merge conflicts don't exist.
2. Y.js (ADR-0010) is already a CRDT — concurrent edits across devices auto-merge conflict-free at the operation level. Forcing manual merge UI on top of that fights the CRDT we already paid for.
3. Branches/drafts are largely already covered by folders + the `notable` flag. A second "branching" axis creates two competing organization models.

What's *actually* missing is a **human-meaningful snapshot layer** above the Y.js operation log. Y.js stores keystroke-level operations — too granular to show "version 3 of this note." We need periodic, named, restorable snapshots and a visual diff between any two of them. That's Notion/Docs-style version history, not GitHub-style branching.

This ADR scopes that gap precisely. Status remains **Proposed** until prioritized.

## Decision Drivers

- **Build on Y.js, don't replace it.** Y.js already gives us a free operation log; this ADR adds a coarser, human-readable snapshot layer on top — not a parallel history.
- **Single source of truth stays `WorkLog.contentJson`.** Snapshots are *projections* of past states; the live doc is still authoritative.
- **Storage budget must be bounded.** Naive snapshotting (every save) explodes the database; retention policy is a day-one requirement, not a future cleanup task.
- **No invented complexity.** Restore = "copy old `contentJson` over current `contentJson`" — no merge, no conflict resolution. Worst-case operation is overwrite.
- **Diff readable, not pixel-perfect.** Visual diff at the ProseMirror node level (paragraph add/remove, span insert/delete) is enough. Character-level git-style diff is wasted effort on rich text.
- **Minimal schema additions.** One table, no relation explosion. Mirror the additive pattern from [ADR-0016](./0016-note-to-note-linking-and-backlinks.md).

## The Griller — questions answered upfront

1. **What user need is actually driving this?**
   The valuable case is "I edited yesterday and want to see/restore what changed" (time travel). The *imagined* cases ("draft an alternative version," "two devices conflicted") are either better solved by existing tools (folders, `notable` flag) or already auto-handled (Y.js). Build for time travel only.
2. **What triggers a snapshot?**
   Idle-debounced + edit-volume heuristic. Specifically: snapshot **30s after last edit** if at least *N* characters changed since last snapshot (where *N* is a tunable constant, e.g. 50). Plus a **manual "Save version"** button for explicit milestones the user names. This avoids both the "every keystroke" trap and the "useless flat history" trap.
3. **What's the storage footprint?**
   Each snapshot ≈ size of `contentJson` (no delta encoding in v1). Tiered retention prevents runaway:
   - **Last hour:** keep all snapshots (≤ ~10 entries assuming 30s debounce + active typing)
   - **Last 24h:** thin to 1 per hour (~24 entries)
   - **Older than 24h:** thin to 1 per day, kept indefinitely
   - **Manual snapshots:** never thinned (user-named, low volume)

   Back-of-envelope: 1,000 notes × ~30 retained snapshots × ~3 KB ≈ 90 MB per user. Acceptable. If it ever isn't, switch to delta encoding (Option C in this ADR) — the schema is forward-compatible.

## Considered Options

### Option A — Snapshot table with full `contentJson` per row + tiered retention

New model `WorkLogVersion { id, workLogId, userId, contentJson, plainText, createdAt, label?, isManual }`. Periodic background job (or on-save server-side check) thins out rows past their retention tier. Restore = read snapshot's `contentJson`, write to `WorkLog.contentJson`, broadcast Y.js update so connected editors converge.

### Option B — Persist Y.js update stream + periodic state vectors

Append every Y.js update to a `WorkLogYUpdate` table; periodically compute `Y.encodeStateAsUpdate` checkpoints. Time travel = play updates up to timestamp T. Theoretically the "purest" CRDT history.

### Option C — Snapshot table with delta encoding between rows

Like Option A, but each row stores a JSON-Patch delta from its predecessor instead of a full `contentJson`. Reconstruct = walk forward from nearest full snapshot.

### Option D — Don't build it; lean on Y.js `UndoManager` + database backups

Y.js gives in-session undo. Postgres backups give point-in-time recovery for catastrophe. Tell the user "we don't ship explicit version history."

## Decision Outcome

**Proposed: Option A.**

- **Simplicity wins.** One table, one cron-style retention job, one diff component. Restore is a single column update. No event-sourcing complexity to debug.
- **Schema stays additive.** No mutation of existing tables; `WorkLog` is untouched.
- **Forward-compatible with delta encoding.** If storage becomes a problem, Option C is a migration of `WorkLogVersion` rows, not a re-architecture. Rejecting Option C *now* is a deliberate complexity-deferral, not a dead end.
- **Y.js stays in its lane.** Real-time merge stays at the CRDT layer (where it belongs); coarse history sits above it. No leaky abstraction between the two.

### Positive Consequences

- Restore is a one-line operation; no merge UI, no conflict states.
- Visual diff has rich tooling (`prosemirror-changeset`) ready to plug in.
- Manual "Save version" gives users a clean checkpoint primitive without exposing them to git's full mental model.
- Builds naturally inside the drawer (ADR-0015): a "History" tab next to "Backlinks" (ADR-0016) feels right.
- Sets the precedent for versioning other rich-text surfaces later (resume entries, profile bio) without re-litigating.

### Negative Consequences

- **No live "playback" of edits.** You see snapshot N → snapshot N+1, not the keystroke story between them. Acceptable trade for storage simplicity.
- **No branching/drafts.** If a user genuinely wants to keep two parallel versions, they create two notes (folders solve this). Some users may interpret "version history" as branching and be disappointed; mitigation = clear UI copy ("Restore old version" button, not "Switch branch").
- **Restore is destructive.** Restoring v3 over current creates a *new* snapshot of the pre-restore state (so it's recoverable), but the current doc *is* overwritten. Mitigation: confirm dialog + always-snapshot-before-restore.
- **Manual snapshot proliferation.** If users hammer "Save version" every minute, retention thinning won't apply (manual snapshots are pinned). Mitigation: per-note manual-snapshot cap (e.g. 50), oldest-pinned-replaces-newest beyond cap.
- **Y.js connected sessions on restore.** Two devices editing concurrently when one hits "Restore" → restored content is broadcast as a Y.js update; the other device sees its in-flight edits clobbered. Mitigation: warn on restore if active connections > 1.

## Pros and Cons of the Options

### Option A — Full-snapshot table with tiered retention

- ✅ Simplest possible schema (one new table).
- ✅ Restore = single Prisma update. No event sourcing.
- ✅ Diff between any two rows is a pure function call.
- ✅ Tiered retention is a familiar pattern (database cron / pg_cron / app-level job).
- ✅ Forward-compatible with delta encoding.
- ❌ Storage scales linearly with snapshot count (mitigated by retention tiers).
- ❌ No keystroke-level playback (acceptable per Griller answer #1).

### Option B — Y.js update stream + state vectors

- ✅ True keystroke-level history; can reconstruct *any* moment.
- ✅ "Pure" CRDT architecture.
- ❌ Replay performance: 10,000 updates → seconds of CPU to reconstruct an old state.
- ❌ Storage explodes for active notes (every keystroke = a row). Compaction is its own subsystem.
- ❌ Diff between two arbitrary timestamps requires reconstructing both states first — expensive.
- ❌ Inverts the simplicity calculus: we'd be building an event-sourced system to deliver a Notion-grade UX.

### Option C — Snapshot table with delta encoding

- ✅ Storage roughly proportional to *change volume*, not snapshot count.
- ❌ Reconstruction of arbitrary version requires walking deltas from nearest base — adds latency to restore and diff.
- ❌ Migration risk if a delta is ever corrupted (whole chain past it is unreadable).
- ❌ Premature optimization: Option A's storage budget is fine for the foreseeable scale.
- 🟡 **Right answer if/when Option A's storage becomes a problem.** Defer.

### Option D — Don't build it

- ✅ Zero complexity added.
- ❌ User explicitly asked for it; "Y.js does CRDT" is not a satisfying answer for "I want to see what I wrote yesterday."
- ❌ Postgres backups are catastrophic-recovery, not user-facing time travel.
- 🟡 The honest "do nothing yet" path. Reasonable if other sprint priorities outweigh this — which is exactly why this ADR is **Proposed**, not **Accepted**.

## Implementation Sketch (when greenlit)

### Schema

```prisma
model WorkLogVersion {
  id          String   @id @default(uuid())
  workLogId   String
  userId      String
  contentJson Json
  plainText   String?       // for quick preview without rehydrating ProseMirror
  label       String?       // user-set name on manual snapshots
  isManual    Boolean  @default(false)
  createdAt   DateTime @default(now())

  workLog     WorkLog  @relation(fields: [workLogId], references: [id], onDelete: Cascade)

  @@index([workLogId, createdAt])
  @@index([userId])
}
```

### Snapshot triggers

1. **Auto-snapshot:** server-side, on save handler. If `(now - lastSnapshotAt) > 30s` AND `editDistance(prevPlainText, currentPlainText) > 50`, write a snapshot. Otherwise skip.
2. **Manual snapshot:** new `POST /api/work-logs/[id]/versions` endpoint, accepts `{ label }`. Always writes (subject to per-note manual cap).
3. **Pre-restore snapshot:** before applying a restore, snapshot current state with auto-label `"Before restore from <timestamp>"`. Always written, exempt from auto-thinning.

### Retention job

- Run on save (cheap path) **or** as a daily pg_cron / app cron. Algorithm:
  - For each `(workLogId)` with > 10 auto-snapshots in last hour: keep newest 10, delete rest.
  - Auto-snapshots between 1h and 24h old: keep one per hour.
  - Auto-snapshots older than 24h: keep one per calendar day.
  - Manual snapshots: never auto-deleted; per-note cap of 50, FIFO eviction beyond cap.

### Restore flow

1. User clicks "Restore" on version row in History panel.
2. Client confirms: "Restore version from {date}? Your current draft will be saved as a snapshot first."
3. Server: snapshot current → write old `contentJson` to `WorkLog.contentJson` → broadcast Y.js update reflecting new state.
4. Connected editors converge via Y.js. UI flashes restored content.

### UI surfaces

- **Drawer (ADR-0015):** new "History" tab alongside main read view (and future "Backlinks" tab from ADR-0016). Shows version list with timestamps, character delta, manual labels.
- **Visual diff:** click any version → side-by-side or inline diff against current via `prosemirror-changeset`. Toggle between read and diff modes.
- **Manual snapshot button:** in editor toolbar, next to existing actions. Opens small inline label input.

### Out of scope for this ADR

- **Branching / parallel drafts.** If pursued later, earns its own ADR. Today: folders + `notable` cover this.
- **Multi-author blame view.** Single-author app; revisit if/when multi-author lands.
- **Real-time conflict resolution UI.** Y.js owns this layer.
- **Cross-device version sync awareness.** Mitigated via the "active connections > 1" warning; full presence-aware restore is future work.
- **Diff for embedded media (images, mentions, embeds).** v1 diffs text + paragraph structure only; mention chips render as opaque "{label}" tokens in the diff; image diffs are "added/removed" only, not pixel diffs.

## Links / References

- [ADR-0010 — Tiptap + Y.js worklog editor](./0010-tiptap-yjs-worklog-editor.md) — provides the CRDT foundation this layer sits above.
- [ADR-0015 — Worklog notes document manager + drawer reader](./0015-worklog-notes-document-manager.md) — drawer is the natural home for the History tab.
- [ADR-0016 — Note-to-note linking + backlinks](./0016-note-to-note-linking-and-backlinks.md) — sibling Proposed ADR; both add tabs to the drawer.
- [src/lib/worklog/prosemirror-to-text.ts](../../src/lib/worklog/prosemirror-to-text.ts) — `plainText` projection helper to reuse for snapshot rows.
- [prosemirror-changeset](https://github.com/ProseMirror/prosemirror-changeset) — diff library (single dependency add).
