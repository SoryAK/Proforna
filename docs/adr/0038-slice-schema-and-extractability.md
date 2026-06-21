# 0038 — Slice Schema Lock + Shipyard Extractability NFR

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** sory
- **Tags:** architecture, agent-infrastructure, slice-schema, extractability, shipyard-phase-1
- **Chains from:** [ADR-0037](0037-shipyard-context-engineering-layer.md) (Shipyard umbrella; Slice as Phase 1 foundational primitive) — this ADR locks the three open Slice schema decisions deferred there and adds an Extractability non-functional requirement surfaced this session.
- **Roadmap:** [docs/plans/shipyard-roadmap.md](../plans/shipyard-roadmap.md) — Phase 1 sprint kickoff is gated on this ADR's Proposed status (no `docs/c-yard/*.json` file may be authored until these decisions land).

## Context and Problem Statement

ADR-0037 committed to Shipyard in principle and intentionally deferred three Slice schema decisions to this sprint-kickoff ADR. During the kickoff Griller pass the user also surfaced a fourth: **Shipyard is a product, not a Resumsify-internal detail.** Resumsify is the Phase 1 incubator and first tenant. The long-term home is a standalone `shipyard/` repo.

The first three decisions are one-way doors per ADR-0037 Con #2 ("Slice schema is a one-way door"). The fourth — Extractability — is a non-functional requirement that, if not enforced now, forces a painful retrofit at every phase that adds infrastructure (notably Phase 4 file-watcher daemon, Phase 5 background worker, Phase 6 dashboard).

This ADR locks all four before any slice file is hand-authored.

## Decision Drivers

- **Schema lockability today.** Phase 1 commit 1 (first slice + `docs/c-yard/README.md`) must be authorable in the next ETC cycle without re-litigating shape.
- **Drift-proof referential integrity.** ADR-0037's stated Con #1 ("Migration cost is real") gets worse if every Phase 1 slice gains a private relations format.
- **Extraction stays cheap.** Resumsify-specific paths, names, or assumptions baked into Phase 1 cost 10× more to remove at Phase 6 than at Phase 1.
- **Minimum viable Phase 1.** Provisional defaults for non-blocking sub-decisions (G2, G3) preserve velocity; promotion to firm policy waits until first-slice data exists.

## Considered Options

### Decision 1 — Cross-slice relations storage shape

- **Option A — Denormalized in-slice** (slice A holds `→ B`; slice B holds `→ A`). Single-file authoring; bidirectional drift on rename; reverse-lookup requires scanning every slice.
- **Option B — `docs/c-yard/_index.json` adjacency list** ⭐ — single source of truth; bidirectional consistency by construction; reverse-lookup O(1) read; extra write per edge.
- **Option C — Hybrid** (outbound in-slice, derive `_index.json`). Local edits stay local but adds a build step we don't have yet.

### Decision 2 — Global / cross-cutting knowledge home

- **Option A — `_global` slice** under `docs/c-yard/`. Symmetric but invites "junk drawer" behavior.
- **Option B — Keep in user-memory `resumsify-lessons.md`** ⭐ — where it already lives; loaded automatically; preserves the seam at the seam that already works.
- **Option C — Per-slice duplication** of relevant cross-cutting facts. Drift by construction.

### Decision 3 — Scope tiers

- **Option A — Mirror MCP scopes** (resumsify / global / user-profile) → 3 c-yard dirs. YAGNI today.
- **Option B — Shipyard repo-only** ⭐ — minimum viable Phase 1; cross-cutting facts route to user-memory per D2.

### Decision 4 (new this session) — Long-term home

- **Option A — Permanent home inside Resumsify.** Defends sunk cost in this repo's tooling; locks Shipyard into a single-tenant assumption that contradicts the entire "context engineering layer" framing.
- **Option B — Extract to standalone `shipyard/` repo eventually; Resumsify is the Phase 1 incubator** ⭐ — preserves the product framing; forces an Extractability NFR on all Phase 1 work.
- **Option C — Extract immediately as separate repo, develop in parallel.** Premature — there is no second tenant yet, no test signal, no public API to commit to.

## Decision

1. **D1 = B (Adjacency list).** Cross-slice relations live in `docs/c-yard/_index.json` as a JSON object: `{ "<sliceA>": { "<relationType>": ["<sliceB>", ...] }, ... }`. Slices do not store outbound edges. Reverse-lookup is a single `_index.json` read.
2. **D2 = B (User-memory) with boundary rule.** Cross-cutting facts stay in user-memory `resumsify-lessons.md`. Boundary: **library-version-bound facts** (Tiptap 3, TanStack Query v5, Next.js 16 gotchas, etc.) → user-memory because they survive a full Resumsify rewrite. **Codebase-domain-bound facts** (worklog draft race condition, asset-library portal mounting, etc.) → slice. The seam test: "does this fact survive a full Resumsify rewrite? if yes, user-memory; if no, slice."
3. **D3 = B (Repo-only).** Shipyard lives under `docs/c-yard/` in this repo only. No global/user-profile c-yard scopes. If a second tenant ever adopts Slices, scope tiers become a Phase ≥4 ADR question, not a Phase 1 one.
4. **D4 = B (Standalone repo long-term).** Shipyard is committed as a product; Resumsify is Phase 1's first tenant and incubator. The long-term home is a standalone `shipyard/` repo extracted when Phase 6 (observability dashboard) has stabilized enough that the API surface is worth committing to publicly.
5. **NFR — Extractability.** Every Phase 1 artifact must lift out cleanly to a future `shipyard/` repo with no Resumsify-specific naming, paths, or assumptions baked in. Specifically:
   - Schema field names stay generic (`entryPoints`, `traversalRecipes`, `fileFingerprints` — never `worklogEntryPoints` or `resumsifyFingerprints`).
   - The analyzer flag (`--mine-traversals <slice>`) reads paths from a config object, not hardcoded `docs/c-yard/` literals.
   - The migration script (`scripts/memory-to-slice.mjs`) keys off `docs/memory/<shard>.json` shape, not domain-specific assumptions.
   - The Phase 0 reader (compliance.instructions.md update in Phase 1 commit 3) describes the read protocol generically, then names `docs/c-yard/` as this repo's instance.
6. **G1 = A (UI-surface granularity) with split threshold.** One slice per top-level UI surface (a route or major panel). Sub-systems become `entryPoints` rows on the nearest parent slice, not their own slice. Rule of thumb: *if you can't navigate to it as a user, it's not a slice.* A slice may be split if its `fileFingerprints` count exceeds ~15 surface files (promotion-by-growth, not pre-emptive splitting). First-wave slice list under this rule: `worklog-editor` (with `worklog-draft-system` and `tiptap-yjs-integration` as `entryPoints` rows), `worklog-events`, `worklog-map`, `contacts`, `asset-library`. This expands the ADR-0037-roadmap candidate list from 5 to 5 with re-bound contents.
7. **G2 (fingerprint staleness, provisional Phase 1 default).** Phase 0 reader behavior: **warn-and-serve with `staleSurfaces[]` list, never refuse**. A slice with stale fingerprints emits an in-context warning naming which files changed since `lastValidatedAt`; the slice's content is still served. Hard-line policy (e.g. "any mismatch = refuse") deferred to a Phase 1.5 follow-up after first-slice data shows actual churn rates.
8. **G3 (evidence schema, provisional Phase 1 default).** Promoted traversals carry `evidence: { sessions: [{ id: <sessionId>, turnExcerpt: <string ≤200 chars>, toolCallIndex: <number> }, ...] }`. Just enough to audit a promotion by hand. Confidence-score / aggregate-stats fields deferred to Phase 1.5 after first 10 candidates exist and we know what the analyzer can actually compute reliably.

## Consequences

### Pros

1. **Phase 1 commit 1 unblocked.** The first hand-authored slice (`docs/c-yard/worklog-editor.json`) + the schema-doc `docs/c-yard/README.md` can now be drafted without re-opening any architectural question.
2. **Extraction stays cheap.** Treating Resumsify as a tenant rather than a host (D4 + NFR) makes the eventual `shipyard/` repo a `cp -r docs/c-yard/ + scripts/*-slice*.mjs + analyzer` operation, not a refactor. Validated by inspection of the named artifacts: none of them needs to import from `src/`.
3. **Drift-proof relations** (D1 = adjacency list). Rename of slice X requires editing exactly one place (`_index.json`); slice files have no outbound references to break.
4. **User-memory autoload privilege preserved** (D2 = user-memory for cross-cutting). The agent's existing 200-line auto-loaded user memory continues to carry version-bound gotchas. No regression in pre-task context.
5. **Provisional G2/G3 defaults preserve velocity.** Phase 1 first-slice ETC cycle does not need to wait on a fingerprint-policy ADR or a confidence-score schema — defaults are safe and explicit.

### Cons / Trade-offs

1. **`_index.json` is a contention hotspot at scale.** With ~5 slices and one author, fine. At Phase 5 (background diff worker) it becomes a write-conflict surface. Phase 4 (file-watcher) ADR-0041 will need to either serialize writes or shift to a different shape (e.g. derived adjacency from per-slice outbound). Accepted as a Phase 4+ problem.
2. **User-memory split persists during transition.** The seam test ("survives a full Resumsify rewrite?") is judgment, not mechanical. Borderline facts (Prisma 6 quirks, OneDrive lock loops) will require case-by-case decisions. Accepted; alternative was a `_global` slice junk drawer.
3. **G2/G3 provisional defaults will need revision.** If first-slice fingerprints turn out to churn many times per day, "warn-and-serve" becomes "always warn, never useful." Phase 1.5 follow-up is a planned cost, not a surprise.
4. **D4 (standalone repo) commits to a future extraction sprint** that doesn't have a date or trigger yet. Risk: Resumsify-specific shortcuts creep into Phase 1 work despite the NFR. Mitigation: NFR §5 is enforceable at code review and via grep checks in CI (e.g. forbid `"resumsify"` substring in `docs/c-yard/**/*.json`).
5. **Slice granularity rule (G1 = A) under-serves invisible-but-coherent systems.** "Worklog draft system" arguably deserves its own slice on coherence grounds even though it has no route. The promotion-by-growth threshold (>15 surface files) mitigates this — if `worklog-editor` grows past the cap because draft files dominate, draft system becomes its own slice naturally.

## Implementation Plan (this ADR + downstream)

This ADR is the gating artifact. The actual Phase 1 commits remain as scheduled in [shipyard-roadmap.md §Phase 1](../plans/shipyard-roadmap.md):

1. **This commit (ADR-0038 ETC):** lands ADR-0038 Proposed + amends ADR-0037 to record the late-breaking D4 + Extractability NFR + amends roadmap to mark Phase 1 open-decisions as locked + updates parked-ideas top section.
2. **Phase 1 commit 1 (separate ETC):** author `docs/c-yard/worklog-editor.json` by hand + `docs/c-yard/README.md` documenting the schema (with the Extractability rules echoed inline) + initial `docs/c-yard/_index.json` (empty `{}` is valid).
3. **Phase 1 commit 2 (separate ETC):** add `--mine-traversals <slice>` flag to `scripts/analyze-chat-exports.mjs`; emit `docs/c-yard/_candidates/<slice>.candidates.json`.
4. **Phase 1 commit 3 (separate ETC):** update `compliance.instructions.md` Phase 0 lookup stack to read slice-first.
5. **Phase 1 commit 4 (separate ETC):** `scripts/memory-to-slice.mjs` migration script.
6. **Phase 1 commit 5 — promotes this ADR to Accepted** after first slice round-trips through Phase 0 successfully in a second session.

Phase 1.5 follow-up (un-numbered, scoped after commit 5 ships): firm up G2 fingerprint policy + G3 evidence schema based on real data.

## References

- [ADR-0037 — Shipyard context-engineering layer](0037-shipyard-context-engineering-layer.md) — parent ADR; receives this session's amendments (Decision #7 + Con #6) in the same commit.
- [docs/plans/shipyard-roadmap.md](../plans/shipyard-roadmap.md) — sprint sequencing; Phase 1 "Open decisions" updated to "Locked in ADR-0038".
- [/memories/repo/parked-ideas.md](../../memories/repo/parked-ideas.md) — Shipyard top section updated: Phase 1 commit 1 cleared to ship; standalone-repo extraction added as a post-Phase 6 parked item.
- Originating user signal (this session, 2026-06-21): *"I want to make Shipyard its own repo. This version might live in this repo, but I think it's not a good idea long term."* — Decision #4 captures this verbatim in spirit.
