# 0049 — ETRC Rhythm and Commit Queue

- **Status:** Proposed
- **Date:** 2026-06-24
- **Supersedes:** None (ratchets the ETC user-memory pattern into a project-level rhythm with infrastructure)
- **Related:** ADR-0018 (TDD), ADR-0047 (three-column review pipeline), ADR-0048 (Tier A enforcement layer)

## Context

The user's ETC (Execute → Test → Commit) ship rhythm — captured in user memory and used as the default for focused changes — was working but had two unresolved problems as the project's commit volume grew:

1. **Commits between review days weren't tracked.** Review day (ADR-0047) batches Column 1/2/3 review at the end of a sprint. With 20–40 commits accumulating between review days, the question *"which of these are worth deep attention vs. a quick eyeball?"* turned into an in-the-moment decision on every commit ("should I flag this?") — exactly the cognitive-load failure mode that breaks down under ADHD load. The decision was either skipped (signal leak) or made hastily.
2. **Design-quality drift wasn't caught until review day.** Correctness, type-safety, lint, and circular-dep regressions are all caught by `npm run review:phase` (Column 1, ADR-0047 + ADR-0048). But *"is there a better way to shape this?"* — the question that catches design drift before it compounds — only fires on review day, by which point 10 commits may have built on the wrong abstraction.

User proposed an ERTC variant (Execute → Review-by-subagent → Test → Commit) where every commit gets a subagent review BEFORE testing/committing. After grilling, two problems with the proposal:

- Pre-test code review produces generic noise ("consider null", "what about edge case X") — the kind of feedback testing answers 30s later.
- Subagent-per-commit at 20–40 commits/week is a non-trivial token spend (premium budget) or latency tax (local model), even when the commit clearly doesn't need design review.

After grilling and counter-proposal, the agreed rhythm is **ETRC with mechanical pre-gating**: Execute → Test → (auto-classify) → Review-if-risky (local gemma4, post-commit, non-blocking) → Commit (atomic). Every commit gets logged to a tier-bucketed queue regardless of whether R fires.

## Decision

Adopt **ETRC** as the project's default ship rhythm, implemented as a lefthook post-commit hook chain with three layered responsibilities:

### Layer 1 — Mechanical classifier (every commit)

`scripts/review-classify.mjs` — pure Node, no LLM, no network. Given a SHA, examines diff stats and changed-file paths to assign one of three tiers:

- **risky** — schema or migrations (`prisma/schema.prisma`, `prisma/migrations/`), API routes (`src/app/api/`), auth/middleware (`src/lib/auth*`, `src/middleware*`), agent rules (`.github/instructions/`), dependency bumps (`package.json`), diff > 300 LOC, OR `src/lib/`|`src/data/` changed without test files added (TDD-intersect soft signal).
- **trivial** — docs-only (`docs/`, `README.md`, `TESTING.md`), `chore(scripts|deps|deps-dev)` under the LOC threshold, OR single-file changes under 30 LOC.
- **standard** — everything else.

The classifier has a hard contract: never throws, exits 0 always, prints `tier:"unknown"` if it can't determine.

### Layer 2 — Queue logger (every commit, post-commit hook)

`scripts/review-log.mjs` — invoked by lefthook post-commit. Appends ONE line to `docs/review-queue.jsonl` (append-only, gitignored, per-machine) with the classified tier + signals + reasons. For risky-tier commits ONLY, spawns Layer 3 detached so `git commit` returns instantly.

Hard contract: hook NEVER blocks the commit. All errors swallowed; queue write failures are silent. The hook executes in ~0.3s for trivial/standard commits, instantly for risky commits (R runs in background).

### Layer 3 — Local R design check (risky tier only, non-blocking, post-commit)

`scripts/review-r-local.mjs` — fires only for risky commits, detached from the commit critical path. Calls Ollama `gemma4:26b` at `http://localhost:11434` with a narrow design-only prompt: *"Identify ONE structural improvement in ≤ 80 chars (Extract / Move / Reuse / Inline), or reply exactly 'clean'."*

When R completes (typically 30–120s later), it appends a separate `type:"review"` line to the queue, joinable to the original `type:"commit"` line by full SHA. The review-day reader (`scripts/review-queue-read.mjs`) collapses these on output.

Healthcheck-gated: if Ollama is unreachable, R logs `skipped:ollama-unavailable` and exits clean. Same for diff fetch failures, timeouts, or empty model responses — every failure mode lands a queue entry so review day can see what happened.

### Layer 4 — Manual escalation (on-demand, premium subagent)

`scripts/review-escalate.mjs` — `npm run review:escalate <sha>`. Pure formatter: prints the commit diff + a focused design-review prompt for paste into a premium subagent (Copilot Opus/Sonnet) when local R said something interesting or nothing useful. No automatic invocation — the user decides when premium tokens are worth it.

### Review-day workflow

`npm run review:queue` (with optional `--tier risky|standard|trivial`, `--since YYYY-MM-DD`, `--json`) — reads the JSONL queue, joins commit + review lines, prints sorted by tier. Review day flow:

1. `npm run review:queue --tier risky` → focus deep attention on these (full Column 2/3 review).
2. `npm run review:queue --tier standard` → spot-check 1 in 3.
3. `npm run review:queue --tier trivial` → glance only to confirm classifier wasn't fooled.

The queue is per-machine and gitignored (like `workflow-change-log.json`) — it's review-day data, not project source. If wiped, the next `git commit` immediately starts repopulating from HEAD onward.

## Consequences

### Pros

1. **No in-the-moment "is this worth tracking?" decisions.** The classifier is mechanical and runs on every commit. Cognitive load is zero.
2. **Nothing overlooked.** Every commit logged. Review day sees the full set, sorted by tier.
3. **Atomic commit discipline preserved.** No fix-in-loop branch was added — R's suggestions queue for next-cycle rather than extending the current commit. `git bisect` and `git revert` semantics stay clean.
4. **Cost-controlled.** R fires only on the ~28% of commits (validated against today's 7-commit session) that warrant it. Local gemma4 is free. Premium escalation is opt-in per commit.
5. **Non-blocking by design.** Lefthook post-commit + detached R means the commit critical path stays as fast as `git commit` itself. Hook overhead measured at 0.24–0.33s for trivial/standard commits.

### Cons / Trade-offs

1. **Classifier heuristics will misclassify edge cases.** A `chore(scripts):` commit that's actually doing something risky will tier as trivial. Mitigation: review-day glance pass catches these; v2 can add escape-hatch trailers (`Review-Tier: risky`).
2. **R-local prompt is v1 and emits empty responses on small diffs.** Today's two risky commits (`fb4638c` schema migration, `e739ef8` ETRC feature itself) both returned `skipped:empty-response` — gemma4 didn't say "clean" and didn't suggest anything either. The contract is solid (failure mode is logged, joinable, recoverable), but R is providing weak signal on small/structural commits. v2 prompt tuning or per-tier model selection is parked work.
3. **TDD-intersect signal is soft.** `src/lib/` changes without tests trigger `risky` tier, not a hard pre-commit block. ADR-0018 mandates TDD for that path; this is the soft companion. Ratchet to hard via lefthook pre-commit gate is parked as a follow-up (same WARNING → ERROR pattern as ADR-0048 Semgrep rules).
4. **Queue file is per-machine (gitignored).** If the user works across multiple machines, the queues don't merge. Acceptable for solo-dev; would need a sync layer for multi-machine workflows. Mitigation: review-day workflow recipe documents this; commits themselves remain canonical in git, queue is derived.
5. **Ollama dependency for R-local.** When Ollama is down (which happens), R logs `skipped:ollama-unavailable` for every risky commit until it's back. Mitigation: the commit isn't blocked; review day can re-run R-local manually for SHAs with `skipped:` results, or escalate to premium.

### Promotion candidates (deferred, document for review-day data review)

- **v2 R-local prompt tuning**: today's two risky commits both returned empty. Worth a prompt iteration after 5–10 risky commits of data.
- **TDD-intersect hard-block**: ratchet from `risky tier signal` to `lefthook pre-commit gate` (refuses commits in `src/lib/` / `src/data/` / `src/app/api/` without matching `*.test.ts` files in the same commit). Same WARNING→ERROR codification ratchet as ADR-0048.
- **Classifier escape-hatch trailer**: support `Review-Tier: risky|standard|trivial` in commit messages to override mechanical heuristic for known-exception cases.
- **Queue auto-rotation**: archive JSONL entries older than N review cycles to keep the file size bounded.

## References

- ADR-0018 — TDD as first-class skill (the soft TDD-intersect signal in this ADR is the runtime companion to that ADR's compile-time discipline).
- ADR-0047 — Three-column review pipeline (this ADR is the rhythm layer; ADR-0047 is what fires on review day).
- ADR-0048 — Tier A enforcement layer (this ADR is the same pattern — automatic gates that protect human discipline — applied at commit-time instead of push-time).
- `docs/workflows/etrc-rhythm.md` — workflow recipe for the rhythm (created alongside this ADR).
- `docs/workflows/add-review-enforcement-layer.md` — recipe for adding hooks/rules/ecosystems (updated alongside this ADR with the post-commit hook pattern).
- `/memories/repo/parked-ideas.md` — promotion candidates above.
- Commits `e739ef8` (ETRC feature) and `139d1e5` ({ref} fix) — the implementation that this ADR ratifies.
