# 0036 — Workflow Self-Improvement Loop — Phase 2 (Reviewed-Session Ledger + Workflow-Change-Log + Era-Tagged Sidecar)

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** sory
- **Tags:** workflow, tooling, data, persistence
- **Chains to:** Phase 1 cadence reminder (commits `b007d78` / `6f27c58` / `d3a5392` / `37b904f` / `e326dba`)
- **Shipped as:** commits `50c6d12` (this ADR) → `7da8e27` (seed files) → `4ea628a` (analyzer) → `dcbc721` (handoff gate) → `d6cefb4` (recipe) → this commit (wrap)

## Context and Problem Statement

Phase 1 shipped today (2026-06-19) as commit `e326dba` — an active session-start + session-wrap reminder that surfaces "days since last workflow review" and forces a `workflow-reviews.json` ledger append whenever a review is performed. That closed the *first* feedback gap: trust-I'll-remember-to-review.

It did **not** close the next three gaps, which are the actual prerequisites for honest improvement attribution:

1. **No reviewed-session ledger.** Re-running the analyzer over the same `raw/*.jsonl` files double-counts friction. Every subsequent weekly review's "before vs after" comparison will be polluted by sessions already weighted into the prior baseline. Without a ledger, week-2 trend data is fiction.
2. **No workflow-change-log.** Today's 5 shipped rule edits have no machine-readable shipped-at timestamp. The analyzer cannot bucket sessions into pre/post-rule cohorts because it has no rule timeline to bucket against. The user-memory record of practice adoptions (ETC, TDD, Verification-First Bias, Codegraph-First Discipline, dictation, local-LLM workflow) is even more invisible to the analyzer — yet those practices likely moved metrics more than any single agent rule edit. Every cohort comparison built without practice-era tagging is averaging across regimes and is therefore noise.
3. **No forcing-function for practice-adoption authorship.** Phase 1 proved that "trust I'll remember" fails for the workflow-review cadence itself. The same failure mode applies to keeping the user-practice-adoptions stream current. Without a Handoff Architect-level gate, the stream will silently go stale and re-poison every cohort comparison built on it.

Phase 2 closes those three gaps. It deliberately stops short of the dashboard / cohort-comparison UI (Phase 3+) because the user explicitly chose data-first over UI-first: *"I feel like UI often tends to bog my mind about how it looks and all that stuff when the most important thing for us right now is the data."*

## Decision Drivers

- **Atomic foundation** — ledger + change-log + era-tagging are one cohesive unit; shipping them separately re-litigates the data model.
- **Data-first, UI-deferred** — the analyzer must emit era-tagged data this session, but `metrics-summary.md` stays untouched. Phase 3 will decide the rendering shape after one week of real era-tagged data exists.
- **Honest attribution over comprehensive attribution** — Option A boundary handling (bucket by `session.startTime`) is cheaper and clearer than per-tool-call timestamp bucketing; the known caveat (sessions that straddle a ship-time get mis-bucketed) is documented and flagged in the sidecar rather than silently corrected.
- **Forcing-function parity with Phase 1** — Phase 1's cadence reminder works because the agent surfaces and writes on every relevant lifecycle event. Phase 2's practice-adoption tracking inherits the same gate-at-Handoff pattern; anything weaker repeats the failure mode Phase 1 fixed.
- **Reversibility per commit** — each of the 6 commits in the Implementation Plan can be reverted independently. The ledger and change-log are append-only; reverting them is safe.

## Considered Options

### Decision 1 — Phase 2 scope

- **Option A — Tight Phase 2: ADR + ledger + change-log + sidecar tagging (no UI)** ⭐ — atomic foundation; one ADR; data-first; nothing user-visible until Phase 3.
- **Option B — Phase 2 + cohort summary block extends `metrics-summary.md`** — immediate visible payoff but pre-locks cohort UI shape before any era-tagged data exists.
- **Option C — Ship reviewed-ledger only; defer change-log to Phase 2b** — tiny, but the next weekly review still lacks era tags so the cohort feature has no input.

### Decision 2 — Workflow-change-log shape (3 streams or 1?)

- **Option A — Three streams: `agentRuleEdits`, `userPracticeAdoptions`, `infraToolingChanges`** ⭐ — preserves attribution honesty (the user adopting ETC is not the same kind of change as the agent gaining a Grep Gate; conflating them mis-attributes improvement).
- **Option B — Single stream with `streamType` discriminator** — denormalized, looks simpler, but every analyzer query then needs a filter clause; future stream additions still require schema review.
- **Option C — Agent-rule-edits only (drop the other two streams)** — simplest, but accepts the mis-attribution problem permanently and abandons the parked entry's explicit Refinement #1 finding.

### Decision 3 — Era-tagging at session boundaries

- **Option A — Bucket entire session by `session.startTime`** ⭐ — clean per-session metric semantics; documented caveat: the first 24h post-ship is mis-bucketed; analyzer flags `straddleWindow: true` so Phase 3 aggregators can opt to exclude.
- **Option B — Bucket by individual tool-call timestamp** — accurate at the call level but requires a full analyzer refactor from per-session to per-call aggregation; out of scope.
- **Option C — Skip sessions whose `startTime` is within 24h of any ship event** — purist; throws away the most informative sessions (the ones that shipped the rule).

### Decision 4 — Forcing-function for practice-adoption authorship

- **Option A — Handoff Architect content requirement #9 (gate parallel to Memory Keeper + cadence ledger append)** ⭐ — same shape as the Phase 1 cadence append; proven enforceable; mandatory before handoff doc is written.
- **Option B — Advisory checklist in `docs/workflows/session-self-review.md`** — easy to skip; same failure mode Phase 1 was designed to fix.
- **Option C — Auto-detect practice adoption from session content** — requires NLP-shaped heuristics over chat transcripts; brittle; high false-positive risk; defers the manual-authoring problem instead of solving it.

### Decision 5 — `metrics-by-era.json` placement (tracked or gitignored?)

- **Option A — Gitignored** ⭐ — matches `metrics.json` / `metrics-summary.md` / `worst-3/*` precedent; per-machine data; no merge conflicts; cheap to regenerate.
- **Option B — Tracked in git** — durable history but every analyzer run produces a dirty working tree; no signal in the diff.

### Decision 6 — `workflow-change-log.json` placement (tracked or gitignored?)

- **Option A — Tracked in git** ⭐ — change-log entries are durable audit history; the file IS the canonical source of truth for cohort attribution. Loss of this file invalidates every comparison.
- **Option B — Gitignored** — fragile; loss of a single machine = loss of all attribution.

## Decision Outcome

- **Decision 1: Option A** (tight Phase 2, no UI).
- **Decision 2: Option A** (three streams).
- **Decision 3: Option A** (bucket by `session.startTime` with `straddleWindow` flag).
- **Decision 4: Option A** (Handoff Architect Phase 4 field #9 + composite gate extension).
- **Decision 5: Option A** (`metrics-by-era.json` gitignored).
- **Decision 6: Option A** (`workflow-change-log.json` tracked in git).

### Schemas

**`docs/chat-exports/analysis/reviewed-sessions.json`** (gitignored, lives under `docs/chat-exports/`):

```json
{
  "_schemaVersion": 1,
  "_doc": "Append-only ledger of session IDs already analyzed. Analyzer skips these by default; --include-reviewed overrides.",
  "entries": [
    {
      "sessionId": "<filename without .jsonl>",
      "reviewedAt": "<ISO timestamp>",
      "reviewerNotes": "<optional 1-line>",
      "rulesShippedAfter": ["compliance:grep-gate", "..."]
    }
  ]
}
```

**`docs/chat-exports/analysis/workflow-change-log.json`** (tracked in git):

```json
{
  "_schemaVersion": 1,
  "_doc": "Three-stream timeline of workflow changes. Analyzer joins session.startTime against these to compute per-session era tags.",
  "streams": {
    "agentRuleEdits": [
      {
        "id": "<file-slug>:<rule-slug>",
        "shippedAt": "<ISO timestamp>",
        "name": "<short title>",
        "description": "<1-2 lines>",
        "source": "<file path relative to repo root>",
        "commit": "<short SHA>"
      }
    ],
    "userPracticeAdoptions": [
      {
        "id": "<kebab-case slug>",
        "adoptedAt": "<ISO timestamp; use ~midpoint if inferred>",
        "name": "<short title>",
        "description": "<1-2 lines>",
        "evidenceSource": "<file or memory ref>",
        "triggerSession": "<optional session id>",
        "replacedPractice": "<optional id of prior practice this superseded>"
      }
    ],
    "infraToolingChanges": [
      {
        "id": "<kebab-case slug>",
        "shippedAt": "<ISO timestamp>",
        "name": "<short title>",
        "description": "<1-2 lines>",
        "source": "<file path or memory ref>",
        "commit": "<optional short SHA>"
      }
    ]
  }
}
```

**`docs/chat-exports/analysis/metrics-by-era.json`** (gitignored, emitted by analyzer):

```json
{
  "generatedAt": "<ISO>",
  "boundaryPolicy": "session.startTime bucketing; straddleWindow flag set when within 24h of any ship event",
  "sessions": [
    {
      "sessionId": "<id>",
      "startTime": "<ISO>",
      "activeRules": ["compliance:grep-gate", "..."],
      "activePractices": ["etc-workflow", "..."],
      "activeInfra": ["mcp-supervisor-nssm", "..."],
      "straddleWindow": false,
      "cohortHash": "<sha1 of sorted activeRules+activePractices+activeInfra>"
    }
  ],
  "cohorts": [
    {
      "cohortHash": "<sha1>",
      "sessionCount": 7,
      "activeRules": [],
      "activePractices": [],
      "activeInfra": [],
      "aggregates": { "<copy of per-session aggregate shape>": "..." }
    }
  ]
}
```

### Positive Consequences

1. **Honest cohort attribution becomes possible.** The next weekly review can compare metrics for sessions before/after a specific rule ship without averaging across practice eras. Today's 5 findings — explicitly flagged as pre-era-tagging in the seeded `workflow-reviews.json` caveat field — get a re-computation path.
2. **Re-analyzer-safe.** The reviewed-session ledger means subsequent runs only process new sessions by default. Trend data is no longer polluted by re-counting the same friction.
3. **Practice-adoption visibility.** The user's own workflow improvements (ETC, TDD, Verification-First Bias, Codegraph-First Discipline, dictation, Local-LLM stack) become first-class events in the timeline — the parked Refinement #1 concern is structurally addressed.
4. **Forcing-function parity.** Handoff Architect Phase 4 field #9 inherits the same shape as the Phase 1 cadence append. Identical enforcement model; identical failure characteristics if skipped (handoff doc cannot be written).
5. **UI-decision deferred until data exists.** Phase 3 dashboard / cohort comparison shape will be chosen against real era-tagged data, not speculation. Lower probability of building the wrong rendering.
6. **Append-only, machine + human friendly.** All three files are linear JSON arrays / streams. Easy to diff, easy to repair by hand, no migration tooling needed.

### Negative Consequences

1. **Retroactive seed is best-effort.** User-practice adoption dates are mostly inferred from user-memory entries and ADR dates; exact adoption timestamps for items like ETC and Codegraph-First Discipline are approximations. The seed entries carry `evidenceSource` references but no claim to timestamp precision better than ±1 week.
2. **Boundary mis-bucketing for ship-day sessions.** Option A bucketing means any session that started in the 24h before a rule shipped will be classified pre-ship even if most of its work happened post-ship. Flagged via `straddleWindow: true`; Phase 3 aggregators may exclude.
3. **No payoff visible until next weekly review.** This ships infrastructure, not insight. Today's analyzer run output stays identical except for the new sidecar file. Mitigation: explicit framing in the ADR + parked-ideas update that this is foundation work.
4. **Handoff Architect adds one more gate.** Field #9 means Phase 4 now has Memory Keeper + Workflow Logger + practice-adoption check + cadence ledger + handoff doc. More to skip; more to enforce. Acceptable cost given Phase 1's gate proved enforceable.
5. **`workflow-change-log.json` is now a tracked-file dependency for the analyzer.** Deleting or corrupting it silently degrades era tagging to "all sessions in one mega-cohort." Mitigated by file presence check in the analyzer (loud warning, not silent fallback).
6. **~80% logic overlap risk between streams.** The three stream schemas share most fields (`id`, `name`, `description`, `*At`). Acknowledged tech debt; a future refactor could extract a `StreamEntry` interface. Not done now to keep the diff atomic.

## Pros and Cons of the Options

### Decision 1

#### A — Tight Phase 2 (no UI)

- ✅ Atomic foundation
- ✅ Data-first, UI deferred until evidence exists
- ✅ Matches parked-entry discipline
- ❌ No user-visible payoff this session

#### B — Phase 2 + cohort summary block

- ✅ Immediate visible payoff
- ❌ Pre-locks UI shape before data exists
- ❌ Scope creep risk

#### C — Reviewed-ledger only

- ✅ Tiny
- ❌ Next weekly review still lacks era tags
- ❌ Cohort feature input still missing

### Decision 2

#### A — Three streams

- ✅ Honest attribution (rule vs practice vs infra)
- ✅ Each stream evolves independently
- ❌ Three schemas to keep in sync (mitigated: nearly identical)

#### B — Single stream + discriminator

- ✅ One schema
- ❌ Every analyzer query needs filter clauses
- ❌ Future stream addition still re-opens schema review

#### C — Rule edits only

- ✅ Simplest
- ❌ Permanent mis-attribution (Refinement #1 unresolved)

### Decision 3

#### A — startTime bucketing + straddleWindow flag

- ✅ Cheap; no analyzer refactor
- ✅ Caveat documented and machine-readable
- ❌ First-day mis-bucketing for ship-day sessions

#### B — Per-tool-call bucketing

- ✅ Accurate
- ❌ Requires per-call aggregation refactor (out of scope)

#### C — Skip straddle sessions

- ✅ Honest
- ❌ Throws away most informative sessions

### Decision 4

#### A — Handoff Architect Phase 4 field #9

- ✅ Parity with proven Phase 1 cadence gate
- ✅ Enforceable; handoff doc gated on it
- ❌ One more thing to write at session wrap

#### B — Advisory checklist

- ✅ Zero enforcement cost
- ❌ Same failure mode Phase 1 fixed

#### C — Auto-detect

- ✅ No manual writing
- ❌ Brittle NLP; defers the problem instead of solving it

### Decision 5

#### A — Gitignored `metrics-by-era.json`

- ✅ Precedent with other analyzer outputs
- ✅ No per-run merge conflicts

#### B — Tracked

- ✅ Durable history
- ❌ Every analyzer run = dirty tree

### Decision 6

#### A — Tracked `workflow-change-log.json`

- ✅ Durable audit source of truth
- ✅ Diffable history of all workflow evolution
- ❌ Adds one tracked file (acceptable)

#### B — Gitignored

- ✅ No tracked file noise
- ❌ Single-machine fragility; losing it loses cohort attribution

## Implementation Plan (units)

| # | Unit | Files | Commit |
| --- | --- | --- | --- |
| 1 | ADR-0036 Proposed | `docs/adr/0036-workflow-self-improvement-loop-phase-2.md` | commit 1 |
| 2 | Reviewed-session ledger schema + retroactive seed (21 sessions) | `docs/chat-exports/analysis/reviewed-sessions.json` (gitignored) | commit 2 |
| 3 | Workflow-change-log schema + 3-stream retroactive seed | `docs/chat-exports/analysis/workflow-change-log.json` (tracked) | commit 2 |
| 4 | Analyzer integration: skip-reviewed + `--include-reviewed` + `--mark-reviewed` + era tagging + `metrics-by-era.json` emitter | `scripts/analyze-chat-exports.mjs` | commit 3 |
| 5 | Handoff Architect Phase 4 field #9 (practice-adoption gate) + composite gate extension | `.github/instructions/persistence.instructions.md` | commit 4 |
| 6 | Session-self-review recipe updates (steps 0a / 6a / 8) | `docs/workflows/session-self-review.md` | commit 5 |
| 7 | Flip ADR Accepted + parked-ideas Phase 2 → shipped + memory write to `WorkflowSelfReviewSystem` | this ADR + `/memories/repo/parked-ideas.md` + `docs/memory/workflow-self-review.json` | commit 6 |

## Validation Plan

- After commit 2: file-presence + JSON-parse check on both seed files. Manual eyeball of seed entries against user-memory ground truth.
- After commit 3: `get_errors` clean on the analyzer; run with `--include-reviewed` against the existing 21-session corpus; expected — `metrics-summary.md` byte-identical to prior run, new `metrics-by-era.json` lists all 21 sessions tagged. Run without flag; expected — "Skipping 21 already-reviewed sessions; --include-reviewed to override" log line; no metrics regenerated.
- After commit 4: visual inspection of the new persistence rule; the Handoff Architect field rendering will be validated live by *this very ADR's* wrap-up handoff later in the session — the field must surface there or the rule placement is wrong.
- After commit 5: `markdownlint` pass on the recipe (no MD-rule violations expected).
- After commit 6: ADR Status field reads "Accepted"; parked-ideas re-entry triggers reference Phase 3; memory write visible via a follow-up `mcp_memory-resums_open_nodes(["WorkflowSelfReviewSystem"])` call.

## Out of Scope (Phase 3+)

- Static HTML dashboard (`docs/chat-exports/analysis/index.html`)
- Cohort comparison rendered inside `metrics-summary.md`
- Excalidraw pipeline diagrams under `docs/workflows/diagrams/`
- `improvement-intentions.md` handwritten list
- Per-rule effectiveness sparklines / charts
- Any UI surface inside the Resumsify app for workflow data

These are deliberately deferred until at least one weekly review cycle has produced era-tagged data the dashboard can render. See `/memories/repo/parked-ideas.md` "Workflow Self-Improvement Loop" entry for the full Phase 3+ scope and re-entry triggers.
