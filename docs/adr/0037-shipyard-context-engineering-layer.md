# 0037 — Shipyard Context-Engineering Layer (Slice as Foundational Primitive)

- **Status:** Proposed
- **Date:** 2026-06-19
- **Deciders:** sory
- **Tags:** architecture, tooling, agent-infrastructure, memory, codebase-intelligence
- **Supersedes (long-term):** the `@modelcontextprotocol/server-memory`-backed memory graph as the canonical store for codebase intelligence (entities + observations + relations remain readable as legacy during transition)
- **Chains from:** ADR-0036 (workflow self-improvement loop Phase 2 — the analyzer + era cohorts that become Shipyard's training signal)
- **Phased delivery:** see [docs/plans/shipyard-roadmap.md](../plans/shipyard-roadmap.md) for the 6-phase sprint plan; each phase ships under its own ADR (0038+) when promoted from Proposed → Accepted.

## Context and Problem Statement

Across the last 21 reviewed sessions the agent has spent a measurable fraction of every session **re-discovering** what it already knew on prior sessions:

- Re-running `codegraph_search` on symbols that were traversed last week.
- Re-loading memory entities, re-reading the same gotcha observations, then still re-running the codegraph chain to find the *code* the observation refers to.
- Re-opening `docs/memory/<shard>.json` shards by hand because the MCP store is opaque to file-fingerprint validation.

Three structural problems make this a permanent tax, not a one-off:

1. **Knowledge is split across two unconnected stores.** The MCP memory graph holds **WHY** (semantic claims, gotchas, design intent). Traversal knowledge — **HOW** to actually reach the code an observation refers to — has no home. It is re-derived every session via codegraph round-trips. `docs/workflows/` holds outcome recipes (how to ship a feature), not orientation recipes (how to traverse to it).
2. **The memory graph schema is borrowed, not designed.** Entities / observations / relations is the `@modelcontextprotocol/server-memory@0.6.3` shape we adopted because it was free. Free-form prose observations + manual date tags = weak validation discipline by construction. There is no slot for file fingerprints, no slot for cached tool outputs, no slot for traversal sequences. Stuffing them in violates the schema and breaks the MCP server's read path.
3. **Cross-store referential integrity is impossible.** Any future cache that referenced memory entities (e.g. *"`worklog-editor` traversal needs `WorklogDraftSystem` semantics"*) would be a dangling pointer the moment the entity name changes. Renames go undetected; the cache rots silently.

The fix is not "a better memory graph" — it is **one** primitive that owns WHY + HOW + VALIDATION + PROVENANCE, with a deterministic validation discipline (file SHAs, not date-tagged prose), and an authoring loop that the existing analyzer can feed.

The user's original "Shipyard" / "C-yard" framing (October 2026 sketch — *Context Isolation & Tool Caching, Real-Time Codebase Syncing, Multi-Layer Validation, Observable Backend Metrics*) is the right architectural shape. This ADR commits to it in principle and locks Slice as the foundational primitive that the rest of Shipyard builds on.

## Decision Drivers

- **One primitive, not two coordinated stores** — eliminates cross-store referential drift by construction.
- **Deterministic validation** — file SHA fingerprints beat date-tagged prose for staleness detection; cheap to compute, unambiguous.
- **Reuse the analyzer as the training pipeline** — ADR-0036's `metrics.json` + `metrics-by-era.json` already parse every `toolCall` per session; Shipyard's candidate-mining is a new analyzer flag, not a new data pipeline.
- **Incremental delivery without server commitment** — Phase 1 ships flat JSON files only; no daemon, no MCP server, no schema migration on shared infrastructure. Server only earns its budget at Phase 4+ when file-watcher invalidation justifies it.
- **Honest cohort attribution survives the transition** — the workflow-change-log era tags continue working; Shipyard adoption itself becomes an `infraToolingChanges` entry whose effect on future cohorts can be measured the same way every other change is measured.

## Considered Options

### Decision 1 — Memory graph vs Slice as the canonical primitive

- **Option A — Slice is canonical; memory graph becomes legacy read-fallback during transition** ⭐ — Slice subsumes observations + relations + adds traversals + fingerprints. Migration via one-shot shard-to-slice converter. Memory MCP server stays read-only during transition, deprecated when every observation has a slice home.
- **Option B — Keep both stores, Slice references memory entities** — what the previous design sketch defended. Honest objection: two stores = two writes per domain change, two read paths, guaranteed referential drift on every rename. Defends sunk cost in the MCP server, not architecture.
- **Option C — Extend the memory MCP server's schema to hold traversals + fingerprints** — schema fork on an upstream we don't control (we already patch it twice for naming + tokenization; a third patch for new fields is the breaking-point). Authoring ceremony stays heavy (gate-then-write `open_nodes` protocol). Update cadence mismatch persists (fingerprints churn per commit; observations don't).

### Decision 2 — Phase 1 storage shape

- **Option A — Flat JSON files at `docs/c-yard/<slice>.json`** ⭐ — read with `read_file`, no new server, git-trackable diff, mirrors the `docs/memory/<shard>.json` shape that already works.
- **Option B — SQLite database at `docs/c-yard/slices.db`** — fast structured queries but git-binary, requires a query tool, premature for Phase 1 read patterns (one slice per Phase 0 lookup).
- **Option C — New MCP server wrapping a Shipyard daemon** — couples the foundational primitive decision to a server-vs-not decision that should defer to Phase 4 (file-watcher) when there's a real reason to run a process.

### Decision 3 — Authorship loop for Phase 1

- **Option A — Analyzer mines candidates, human promotes** ⭐ — analyzer emits `docs/c-yard/_candidates/<slice>.candidates.json` from chat exports (frequency × success-signal); user hand-promotes to `<slice>.json`. Same human-in-the-loop discipline that keeps the memory graph shallow.
- **Option B — Auto-promote candidates above a confidence threshold** — risks polluting Shipyard with marginal traversals; loses the curation gate that has kept the existing memory graph high-signal.
- **Option C — Hand-author from scratch, no analyzer help** — abandons the existing analyzer investment; high friction; will not happen consistently in practice.

## Decision

1. **Adopt Shipyard as the umbrella context-engineering layer.** It owns the WHY + HOW + VALIDATION + PROVENANCE of every topic-bounded slice of the codebase the agent needs to navigate.
2. **Slice is the foundational primitive.** Topic-keyed JSON manifests at `docs/c-yard/<slice>.json` are the canonical store. Each slice contains: `semantics` (gotchas, design intent), `entryPoints` (primary component/hook/route), `traversalRecipes[]` (intent-tagged tool-call chains with `expectedSurface`), `relations[]` (cross-slice edges), `fileFingerprints{}` (sha1 per surface file), `minedFromSessions[]` + `evidence{}` (provenance).
3. **The memory graph becomes a read-fallback during transition, not a peer system.** New observations are written to slices. Existing entities continue to be read via MCP during Phase 1 for un-migrated topics. Deprecation completes when every entity has a slice home; the `MCPMemorySupervisor` service is then optional.
4. **The six-pillar Shipyard vision is committed in principle, deferred in implementation.** Phase 2-6 architectural decisions land in their own ADRs (0038+) when each phase is scoped for a sprint. The phased delivery plan lives in [docs/plans/shipyard-roadmap.md](../plans/shipyard-roadmap.md).
5. **The chat-export analyzer is Shipyard's training pipeline.** A new `--mine-traversals <slice>` flag extracts candidate traversal chains from reviewed sessions (filtered by no-fallback-grep + no-negation success signal). `metrics-by-era.json` continues providing the era-cohort tagging Shipyard cache-invalidation reasoning will need.
6. **The three open Slice schema decisions are deferred to the Phase 1 sprint kickoff ADR (0038):**
   - Cross-slice relations storage shape (denormalized per-slice vs `_index.json` adjacency list).
   - Where global / cross-cutting knowledge lives (a `_global` slice vs userMemory).
   - Whether slices need scope tiers (repo / global / user-profile) mirroring the memory MCP scoping, or whether Shipyard is repo-only and other scopes stay in their current homes.

## Consequences

### Pros

1. **Single source of truth for codebase intelligence.** One read in Phase 0 — `docs/c-yard/<slice>.json` — replaces memory `open_nodes` + `codegraph_search` round-trip on familiar topics. Estimated 2 codegraph round-trips saved per session on previously-touched domains. Multiplied across the full Shipyard roadmap (Phase 2 cached tool outputs, Phase 3 priming), this compounds.
2. **Deterministic staleness detection.** `sha1(file) === fingerprint` is unambiguous; date-tagged prose is not. Removes the "is this gotcha still true?" guesswork that today requires the agent to re-derive observations.
3. **Captures traversal knowledge that has been homeless.** "How do you actually navigate to the worklog draft flush code?" has lived in chat transcripts, agent muscle memory, and nowhere else. Slices give it a durable home and a deterministic decay model.
4. **Analyzer investment compounds.** ADR-0036 shipped today; era-cohort tagging and per-session toolCall arrays are already parsed. Shipyard mining is a flag on the same script, not a new pipeline.
5. **Eliminates the MCP server's recurring operational tax.** The 503 "Single-client backing server already occupied" failure mode (user-memory `MCP Memory 503` entry), JSONL corruption recovery, the NSSM supervisor patching ceremony — all become bounded transition costs rather than permanent overhead.

### Cons / Trade-offs

1. **Migration cost is real.** Every domain entity in the MCP graph + every shard in `docs/memory/` eventually needs a slice. Best-case: one-shot conversion script (~half-day). Worst-case: schema fidelity gaps force manual reauthoring of ~half the entries. This is amortized over weeks, not days.
2. **Slice schema is a one-way door.** Once Phase 1 slices exist in git history, post-mint schema changes require either a coordinated migration or a `version` field with backward-compat readers. The three open decisions in Decision §6 must be locked at Phase 1 sprint kickoff before any slice is hand-authored, not iteratively.
3. **Locks in the "flat-files + analyzer" technology stance until Phase 4+.** Server-side features (push invalidation, frequency priming, real tool-output caching) are explicitly deferred. If a real-time invalidation need surfaces sooner (e.g. multi-machine work), the roadmap order has to be revisited and Phase 4 jumps the queue.
4. **The memory MCP server enters a long-lived "legacy" phase.** During transition both stores read; that is the cross-store drift problem this ADR was authored to eliminate, briefly recurring during migration. Mitigated by speed of migration (one shard at a time, ordered by domain hotness) and by Phase 0 read order (slice first, MCP fallback) so the slice is always the authoritative source when both exist.
5. **Cohort attribution gets noisier during the transition era.** Sessions split across "old memory MCP only" + "slice + MCP fallback" + "slice only" will produce three sub-cohorts. The analyzer's `workflow-change-log.json` entries for the transition phases must be authored carefully to keep era tagging honest.

## Implementation Plan (Phase 1 only — Phase 2-6 deferred to per-phase ADRs)

Per the prerequisite in Decision §6, **the Phase 1 sprint kickoff opens ADR-0038 (Proposed)** that locks the three open Slice schema decisions before any slice file is authored.

The full per-phase sprint sequence — including Phase 1 commit shape — lives in [docs/plans/shipyard-roadmap.md](../plans/shipyard-roadmap.md). This ADR commits to the principle; the roadmap commits to the sequence; each phase's ADR commits to the implementation.

## References

- [docs/plans/shipyard-roadmap.md](../plans/shipyard-roadmap.md) — 6-phase delivery plan.
- [docs/adr/0036-workflow-self-improvement-loop-phase-2.md](0036-workflow-self-improvement-loop-phase-2.md) — analyzer + era cohorts that become Shipyard's training signal.
- [scripts/analyze-chat-exports.mjs](../../scripts/analyze-chat-exports.mjs) — Shipyard's candidate-mining base; `--mine-traversals <slice>` flag arrives in Phase 1.
- [scripts/patch-mcp-memory.js](../../scripts/patch-mcp-memory.js) — patches the upstream memory server (naming + tokenization); preserved during transition, deprecated when Phase 1 migration completes.
- [docs/memory/index.json](../memory/index.json) — current memory shard index; converter script reads this to enumerate entities for migration to slices.
- User memory `resumsify-lessons.md` (MCP Memory Supervisor + Patches sections) — operational context for the MCP server that Shipyard eventually deprecates.
- Originating user sketch (October 2026 — "Shipyard / C-yard core factors") — the 6-pillar vision this ADR commits to in principle.
