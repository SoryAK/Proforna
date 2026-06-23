# Three-Column Review Pipeline — cost-tier the review surface

- **Status:** Proposed (2026-06-23)
- **Date:** 2026-06-23
- **Deciders:** Sory
- **Tags:** workflow, tooling, review, cost-control, agent-process
- **Builds on:** [ADR-0018](./0018-tdd-as-first-class-skill.md) (Test-first discipline)

## Context and Problem Statement

The agent process has accumulated review surface area faster than review *budget*. Every phase-end (multi-commit feature sprint) the same loop has been running on premium-tier Copilot turns:

- Walk the diff for obvious type / lint / dead-code issues
- Spot-check slice manifest traps the change might have triggered
- Verify owner-scope checks on new route handlers
- Eyeball schema fidelity on Prisma touch points
- Look for architectural drift the diff doesn't make obvious

That is **five distinct review jobs of wildly different complexity** being lumped into one premium-priced agent turn. Two cost levers were being ignored:

1. **Determinism asymmetry.** Type errors, lint violations, dead imports, circular dependencies, and failing tests are **deterministic** — an OSS tool can answer authoritatively in seconds. Spending an LLM turn on them is paying premium rates for `tsc --noEmit`.
2. **LLM tier asymmetry.** "Did this break the slice trap for stale `getQueryData` reads?" is a semantic check a local model (gemma4:26b + codegraph + slice manifest) can answer adequately. "Should this section be redesigned because the visual hierarchy is inverted?" needs a premium tier. Routing every finding through the same model is wasteful in both directions — premium burn on cheap checks, cheap model on stakes it can't reach.

Concretely, audit data of the last 21 transcripts: phase-end review consistently consumed 8-15 premium Copilot turns when the surface was 90% deterministic. The recent T1+T2+T3 cleanup pass (commit `ef75099`) **proved** the deterministic path is sufficient for that 90% — 1219 inflated eslint counts dropped to 495 real errors, 22 type errors enumerated, 0 knip orphans, 0 madge cycles, 966/971 vitest. All of that came from OSS tools, none of it from LLM judgment.

The follow-up commit (`4d5d08d`) added `npm run review:phase` — a self-contained gate that re-runs all 5 OSS checks, parses structured counts, and diffs them against a tracked baseline (`docs/review-baseline.json`). Red-team verified: a contrived `any` annotation in an unused file triggers exit 1 with both eslint and knip catching it.

**That commit is column 1 of a three-column pipeline.** The remaining two columns are not built yet. This ADR captures the architecture so they get built with intent rather than improvised.

## Decision Drivers

- **Cost-tier per finding category.** Cheap checks must run on cheap tiers. Premium tiers reserved for premium decisions.
- **Determinism-first.** Anything an OSS tool can verify must run before any LLM turn — both cheaper and more reliable.
- **Baseline-tracked progress.** Improvements stick. Regressions surface. Hand-waving "feels cleaner now" is not enough.
- **Workflow-locked.** Review must be invocable as a single command tied to the ship rhythm (E→T→R→C), or it gets skipped under pressure.
- **Incremental build.** Column 1 is shipped today. Column 2 must be designed but built later, on a real slice, to avoid premature abstraction.

## Decision

Adopt a **three-column review pipeline**, ordered by cost tier:

### Column 1 — OSS Deterministic (built, commit `4d5d08d`)

**Tools:** `tsc --noEmit` / `eslint` / `knip` / `madge --circular` / `vitest run`
**Runtime:** ~170s sequential (acceptable for phase-end)
**Cost:** free (CPU only)
**Entry point:** `npm run review:phase`
**Baseline:** `docs/review-baseline.json`, regenerated via `npm run review:phase -- --write-baseline`

Policy:

- **Strict by default** — any gate count > baseline → exit 1
- **`--accept-net` opt-in** — per-gate regressions allowed if the sum across all numeric gates didn't grow
- **`vitest.failed > 0` is a hard fail in all modes** — failing tests are never acceptable churn

This column catches: type errors, lint violations, dead exports, dead dependencies, circular imports, regressed tests. Empirically that is ~90% of the surface an agent had been hand-rolling.

### Column 2 — LLM Chain (designed, not built)

**Stack:** Cline + `gemma4:26b` + codegraph MCP + slice manifests (`docs/c-yard/`)
**Runtime:** minutes per slice (local model, multiple tool calls)
**Cost:** free (local hardware, validated 2026-06-14 on Strix Halo 64GB / Radeon 8060S iGPU)
**Entry point (future):** `npm run review:semantic -- --slice <slug>` or `--diff`

Stages within column 2 (**three-stage chain, verify-first build order**):

1. **Verify** — for each `knownTrap` in the relevant slice manifest, ask the model "did this diff trigger the trap?" Surface boolean + cited line.
2. **Categorize** — for each verified finding, label it `mechanical | semantic | ambiguous`.
3. **Act** — `mechanical` → auto-suggest a fix; `semantic` → escalate to column 3; `ambiguous` → surface for human triage.

**Build order rationale:** ship verify alone first, on a single slice (`worklog-editor`). Confirm the model can faithfully read slice manifests and surface true/false positives before adding categorize+act. The risk in column 2 is hallucinated findings poisoning the action loop — de-risk the input before committing to the output.

### Column 3 — Premium Escalation (designed, not built)

**Tier:** Copilot Opus 4.7+ / Sonnet 4.6 (premium)
**Trigger:** any column-2 finding tagged `category ∈ {redesign, architecture, library-pattern}` plus a manual escalation flag for ambiguous-but-important findings.
**Runtime:** human-in-the-loop, async
**Cost:** premium request budget

This column is **deliberately rate-limited by the column-2 categorizer.** The system must justify *why* a finding deserves premium attention before spending the budget. Findings reach column 3 by passing through 1 and 2; nothing reaches column 3 unfiltered.

### Workflow integration: E→T→R→C

The ship rhythm captured in user memory becomes:

1. **E**xecute — single focused diff
2. **T**est — `get_errors` + `npm test`
3. **R**eview — `npm run review:phase` (column 1 today; columns 2-3 plug in later under the same baseline contract)
4. **C**ommit — heredoc → `git -c gc.auto=0 commit -F`

R is **required** for phase-end commits, pre-push, ADR-shipping, and cross-cutting changes (libs / schemas / types / config). R is **optional** (T still required) for single-file UI tweaks, doc-only commits, and scratch experiments.

## Considered Options

- **Option A — Status quo.** Keep hand-rolling review on premium turns. Predictable cost burn, no enforcement.
- **Option B — OSS gate only.** Stop after column 1. Cheap, deterministic, ships ~90% of the value. But ceiling: cannot catch semantic regressions (slice trap re-occurrence, schema fidelity drift, owner-scope leaks).
- **Option C — Three columns** *(this ADR)*. All three tiers, built incrementally, with column 2 prototyped on a single slice before generalizing.
- **Option D — All-LLM pipeline.** Replace OSS gates with LLM judgment across the board. Strictly worse — pays premium for deterministic checks and loses authoritative reproducibility.

Chose **C** because B's ceiling is real (semantic regressions are exactly the class of bug T1+T2+T3 was *not* designed to catch) and D inverts the cost-tier ordering A already gets wrong.

## Consequences

### Pros

- **Cost-tiered review absorbs ~90% of findings cheaply.** Column 1 is free + deterministic + reproducible. Premium tier reserved for actual premium decisions.
- **Baseline-tracked progress.** Improvements lock in (regenerate baseline) and cannot silently slip back. Red-team verified the gate has teeth.
- **Workflow-locked.** Review is now a single command tied to the E→T→R→C ship rhythm — much harder to skip under pressure than a hand-rolled review pass.
- **Incrementally buildable.** Columns 2 and 3 can be added later without rewriting column 1's contract.
- **Local-model leverage.** Column 2 runs free on existing hardware (validated workflow per user memory: Cline + gemma4:26b + codegraph + memory MCPs).

### Cons / Trade-offs

- **Baseline maintenance discipline.** When intentional improvements land, the baseline must be regenerated via `npm run review:baseline` and committed. Forgetting leaves the bar artificially high — every subsequent commit appears as a "regression."
- **Today's gate is column-1-only.** Until column 2 is built, semantic regressions (slice trap re-occurrence, owner-scope drift, schema fidelity issues) still depend on agent attention. The pipeline does not magically cover those yet.
- **Slice manifest dependency.** Column 2 depends on `docs/c-yard/` slices being current. Stale slices = stale verification. This is the same maintenance burden ADR-0038 already accepted, but column 2 raises the stakes on it.
- **~170s phase gate.** Non-trivial wall-clock cost. Slow enough to be tempted to skip on small changes — addressed by the E→T→R→C "required vs optional" carve-out (R optional for single-file UI / docs / scratch).
- **No CI/pre-commit hook yet.** Today the gate is a local convention. Pre-push enforcement (git hook or CI) is a follow-up; not in scope for this ADR.

## Implementation Notes

- Column 1 is **live** at commit `4d5d08d`. See [scripts/review-phase.mjs](../../scripts/review-phase.mjs) and [docs/review-baseline.json](../review-baseline.json).
- Baseline at proposal time: tsc 22 errors / eslint 495 errors + 10591 warnings / knip 0/0/0 / madge 0 circular / vitest 966 passed + 5 skipped + 0 failed (971 total).
- The 495 baseline eslint errors and 22 baseline tsc errors are **acknowledged pre-existing**; future ADRs may track them down in dedicated cleanup phases.
- Column 2 prototype target: `worklog-editor` slice (highest existing trap surface per audit). Out of scope here.
- Column 3 entry pattern: TBD; likely a Copilot agent invocation with the column-2 findings as input context. Out of scope here.

## Follow-ups (not part of this ADR)

- Prototype column 2 verify-stage on `worklog-editor` slice.
- Decide pre-push enforcement: git hook vs CI vs honor system.
- Decide whether to commit the baseline-regeneration commit alongside cleanup commits or separately (currently: separate, see commit `4d5d08d`).
