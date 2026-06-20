# Shipyard Roadmap — 6-Phase Delivery Plan

- **Status:** Proposed
- **Date:** 2026-06-19
- **Owner:** sory
- **Backing decision:** [ADR-0037 — Shipyard context-engineering layer](../adr/0037-shipyard-context-engineering-layer.md)
- **Re-entry discipline:** This is a roadmap, not an ADR. Sequence and phase definitions may evolve; the *decision* (Shipyard exists; Slice is foundational) is fixed in ADR-0037 and does not drift with this doc.

## Why this doc exists separately from ADR-0037

ADRs are eternal — they capture *why a decision was made*. Roadmaps are seasonal — they capture *what we plan to do next*. The 6 Shipyard pillars in the user's original sketch deserve commitment in principle (the ADR), but their sprint sequencing will be re-planned as each phase ships and we learn what's actually expensive. Mixing both into one ADR turns every re-plan into a fake "architecture amendment."

Same separation other projects in the repo already follow (e.g. ADR-0003 Prisma decision vs ongoing dep-bump sprint docs).

## Phase Overview

| Phase | Pillar (user's sketch) | Primitive shipped | Status | Backing ADR |
| ----- | ---------------------- | ----------------- | ------ | ----------- |
| **0** | Codebase analysis + observability foundations | codegraph, memory graph, analyzer, era cohorts, workflow-change-log | ✅ Shipped | ADR-0011, ADR-0036 |
| **1** | Context Isolation — *Containerized Architecture* | **Slice** (`docs/c-yard/<slice>.json`) | 🎯 Next sprint when promoted | ADR-0038 (to be drafted) |
| **2** | Context Isolation — *Redundant Call Elimination* | Cached tool outputs inside Slice manifests | Deferred | ADR-0039 |
| **3** | Context Isolation — *Frequency Caching* | Usage telemetry → preload priority | Deferred | ADR-0040 |
| **4** | Real-Time Codebase Syncing — *Living Blueprint* | File-watcher push invalidation | Deferred | ADR-0041 |
| **5** | Multi-Layer Validation — *Automated Background Comparison* | Background diff worker on git HEAD changes | Deferred | ADR-0042 |
| **6** | Observable Backend Metrics — *Turn Efficiency + Performance Analysis* | Per-Slice hit/miss/token-saved dashboard | Deferred | ADR-0043 |

---

## Phase 0 — Foundations (✅ shipped)

What Shipyard inherits and does not need to rebuild:

- **codegraph** MCP server — SQLite knowledge graph over the workspace, ~1s lag via file watcher.
- **memory graph** (`@modelcontextprotocol/server-memory` patched + sharded under `docs/memory/`) — semantic claims, gotchas, cross-domain relations. **Becomes legacy read-fallback at Phase 1.**
- **chat-export analyzer** ([scripts/analyze-chat-exports.mjs](../../scripts/analyze-chat-exports.mjs)) — parses every `toolCall` per session, emits `metrics.json` + `metrics-summary.md` + era-cohort `metrics-by-era.json`. **Becomes Shipyard's training pipeline at Phase 1.**
- **workflow-change-log + reviewed-session ledger** (ADR-0036) — per-session era tagging that Shipyard's cache-invalidation reasoning depends on.

---

## Phase 1 — Slice unification (🎯 next when promoted)

**Goal:** Replace the memory graph + scattered traversal knowledge with one canonical primitive.

### Open decisions (must be locked before any slice is hand-authored)

These are the three deferred items from ADR-0037 Decision §6. They become the body of **ADR-0038 (Proposed)** at the start of the Phase 1 sprint, not before:

1. **Cross-slice relations storage shape** — denormalized inside each slice (slice A says `→ B`, slice B says `→ A`) vs `docs/c-yard/_index.json` adjacency list. Denormalization is simpler; the index file is drift-proof but adds a second write per edge.
2. **Global / cross-cutting knowledge** — does a `_global` slice exist, or do cross-cutting facts (e.g. "TanStack Query v5 `getQueryData` is not a subscription") stay in user-memory `resumsify-lessons.md` where most already live?
3. **Scope tiers** — does Shipyard mirror the memory MCP's three scopes (resumsify / global / user-profile), or is Shipyard repo-only and the other scopes stay in their current homes (user memory + future repo-list)?

### Commit shape (sketch — final commit boundaries decided in ADR-0038)

1. **Commit 1 — Schema + first slice.** Lock the schema in ADR-0038, author `docs/c-yard/worklog-editor.json` by hand (the densest existing memory entity, highest re-use signal in chat exports), add `docs/c-yard/README.md` documenting the schema. Verify Phase 0 read path with one manual trial.
2. **Commit 2 — Analyzer mining.** Add `--mine-traversals <slice>` flag to [scripts/analyze-chat-exports.mjs](../../scripts/analyze-chat-exports.mjs). Heuristic: `(toolName, normalizedArgs)` tuples that appear in ≥2 reviewed sessions with no fallback `grep_search` within 3 turns. Emits candidates to `docs/c-yard/_candidates/<slice>.candidates.json`. Human curates → promotes.
3. **Commit 3 — Phase 0 integration.** Add a Phase 0 step in [.github/instructions/compliance.instructions.md](../../.github/instructions/compliance.instructions.md): after memory lookup, check `docs/c-yard/*.json` for topic match; read manifest if matched; print one-line freshness verdict (sha1 fingerprint compare).
4. **Commit 4 — One-shot migration script.** `scripts/memory-to-slice.mjs` reads `docs/memory/*.json` shards → emits per-topic slice files. Manual review pass before each batch lands.
5. **Commit 5 — Wrap + ADR-0038 Accepted.** Migration complete for the first ~5 highest-traffic domains. Memory MCP server stays running as read-fallback for un-migrated entities.

### Exit criteria

- One slice (worklog-editor) is the canonical source for its topic; Phase 0 reads slice-first.
- At least 5 high-traffic domain entities migrated to slices (worklog-editor, worklog-draft-system, contacts/persona, asset-library, tiptap-yjs-integration are likely candidates).
- Analyzer mines candidates on demand; un-promoted candidates do not pollute the canonical store.
- Memory MCP server still runs but is documented as legacy in user memory.
- A second session validates a slice was actually re-used (read once, not re-derived via codegraph) — proof the foundational claim holds.

---

## Phase 2 — Cached tool outputs (deferred)

**Goal:** Slices stop being just *recipes* and start being *cache*. Agent reads cached `codegraph_search("flushDraft")` output instead of re-running it.

### Open architectural decisions for ADR-0039

- Output schema: store full codegraph response payloads in-slice, or sidecar files under `docs/c-yard/_outputs/<slice>/<tool>-<argsHash>.json`?
- Cache key normalization (whitespace, casing, arg-order).
- TTL policy: read-time fingerprint check only, or scheduled refresh?

### Promotion trigger — Phase 2

- Phase 1 has ≥5 active slices and the analyzer shows the same `codegraph_*` call being re-executed across sessions on the same arg set ≥3 times.
- User explicitly scopes "stop re-running codegraph on familiar topics."

---

## Phase 3 — Frequency caching / context preload (deferred)

**Goal:** Per-Slice usage telemetry drives which Slices get preloaded into the agent's Phase 0 context budget.

### Open architectural decisions for ADR-0040

- Telemetry capture: extend analyzer to count slice reads, or instrument Phase 0 with a lightweight log?
- Budget model: how does the agent decide which slices fit a given task's context window?
- Cold-start: how do we preload Slice A before the agent has read it once?

### Promotion trigger — Phase 3

- Phase 2 has cached tool outputs and the analyzer shows the agent still re-discovering which slice is relevant per task.

---

## Phase 4 — File-watcher push invalidation (deferred)

**Goal:** Switch Slice staleness from pull-based (read-time sha compare) to push-based (file-watcher invalidates eagerly). This is the first phase that justifies a daemon process.

### Open architectural decisions for ADR-0041

- Daemon shape: standalone Node script vs reuse `MCPMemorySupervisor` NSSM pattern vs new Shipyard MCP server.
- File-watcher library: `chokidar` (proven in user-memory) vs Node's native `fs.watch`.
- Invalidation propagation: rewrite slice's `lastValidatedAt` in-place vs append to a separate stale-log.

### Promotion trigger — Phase 4

- Pull-based fingerprint checks add meaningful read-path latency (>200ms per Phase 0).
- Multi-machine work begins (laptop + EVO-X2) and pull-based staleness misses cross-machine changes.

---

## Phase 5 — Background diff worker (deferred)

**Goal:** On every git commit, a background worker diffs HEAD vs every Slice's `fileFingerprints[]`, marks stale, queues for re-authoring (auto-promotion of fresh candidates).

### Open architectural decisions for ADR-0042

- Trigger: git hook (`post-commit`) vs daemon polling vs both.
- Re-author policy: auto-promote analyzer candidates above a threshold, or always queue for human review?
- Conflict handling: stale slice still readable, or removed until re-authored?

### Promotion trigger — Phase 5

- Phase 1+4 in production for ≥4 weeks; manual re-authoring becomes the cadence bottleneck.

---

## Phase 6 — Per-Slice observability (deferred)

**Goal:** Dashboard showing per-slice hit rate, miss rate, estimated tokens saved, correlation to friction score. The Phase 0 analyzer already does aggregate observability; Phase 6 makes it per-slice.

### Open architectural decisions for ADR-0043

- Surface: extends ADR-0036 Phase 3 dashboard (still parked) vs standalone Shipyard dashboard.
- Per-slice token-savings estimation methodology.
- Retention: per-session detail vs weekly aggregates only.

### Promotion trigger — Phase 6

- Phase 2+3 shipped; user wants to prove which slices are pulling their weight.
- ADR-0036 Phase 3 dashboard is promoted; Shipyard observability piggy-backs on it.

---

## Re-entry discipline

When picking up *any* phase above:

1. **Re-read ADR-0037 first** to confirm the foundational decision hasn't been re-litigated.
2. **Re-read this roadmap** to confirm the phase sequence and the open architectural decisions for that phase's ADR.
3. **Draft the per-phase ADR (0038+) first.** Do not start coding until the open architectural decisions for that phase are locked.
4. **Single E→T→C cycle per commit boundary** as defined in the per-phase ADR. Do not bundle phases.
5. **Update this roadmap** after each phase ships: mark status, link the accepted ADR, document any deviation from the planned commit shape.

## Cross-references

- [docs/adr/0037-shipyard-context-engineering-layer.md](../adr/0037-shipyard-context-engineering-layer.md) — the decision this roadmap implements.
- [docs/adr/0036-workflow-self-improvement-loop-phase-2.md](../adr/0036-workflow-self-improvement-loop-phase-2.md) — Phase 0 foundations this roadmap inherits.
- [scripts/analyze-chat-exports.mjs](../../scripts/analyze-chat-exports.mjs) — the analyzer that becomes Shipyard's training pipeline at Phase 1.
- [docs/memory/index.json](../memory/index.json) — current memory shard index; converter reads this at Phase 1 commit 4.
- User original sketch ("Shipyard / C-yard core factors", October 2026) — source of the 6-pillar vision; preserved verbatim in the Phase 1+ ADRs' Context sections as they get drafted.
