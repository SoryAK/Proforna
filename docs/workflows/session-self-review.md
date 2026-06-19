# Session Self-Review — Analyze Past Chat Transcripts

**Workflow Type:** `session-self-review`
**Last Updated:** 2026-06-19 (Phase 2 — era-tagging + reviewed-session ledger)

## Stack Context

- Node 22.18.0 (no extra deps; pure `node:fs` ESM script).
- `scripts/analyze-chat-exports.mjs` — reads JSONL transcripts from
  `docs/chat-exports/raw/`, emits a 5-category metrics dashboard plus
  worst-3 friction digests plus an optional turn-by-turn deep-dive on a
  target session.
- Transcript source: VS Code Copilot stores per-session JSONL at
  `%APPDATA%\Code\User\workspaceStorage\<workspaceHash>\GitHub.copilot-chat\transcripts\*.jsonl`.
  Each line is `{ type, data, id, timestamp, parentId }`. Types include
  `session.start`, `user.message`, `assistant.message`,
  `assistant.turn_start`/`turn_end`, `tool.execution_start`/`complete`.
- Outputs land in `docs/chat-exports/analysis/` (gitignored alongside the
  raw transcripts in `docs/chat-exports/`).

## When this recipe applies

- You suspect a chronic compliance pattern (grep-for-symbol abuse,
  skipped Post-Edit Scans, terminal-echo recursion, scope creep, etc.)
  and want to quantify it before proposing rule tightenings.
- You are preparing to edit `.github/instructions/*.md` and want audit
  data to justify the change.
- Periodic sweep (e.g. monthly) to catch drift before it ossifies.

This is **not** a per-session ritual. Do not run it during normal coding
sessions — the outputs are static markdown, useful only when you intend
to act on the findings.

## Successful Sequence

1. **Refresh the raw export folder.** Copy the workspace transcript
   directory into `docs/chat-exports/raw/`:

   ```powershell
   $src = "$env:APPDATA\Code\User\workspaceStorage\<workspaceHash>\GitHub.copilot-chat\transcripts"
   $dst = "docs\chat-exports\raw"
   New-Item -ItemType Directory -Force $dst | Out-Null
   Copy-Item "$src\*.jsonl" $dst -Force
   ```

   The workspace hash is the parent folder of the active workspace's
   storage — easy to find by `dir $env:APPDATA\Code\User\workspaceStorage\` and
   matching the `.git` path inside each candidate's `workspace.json`.

2. **Run the analyzer** with optional deep-dive on a target session:

   ```powershell
   node scripts/analyze-chat-exports.mjs --deep-dive <sessionIdPrefix>
   ```

   `--deep-dive` is optional; omit it for the dashboard + worst-3 only.
   Prefix matching is on the filename — first 8 chars is usually unique.

   **Default behavior (ADR-0036 Phase 2):** the analyzer now skips
   sessions whose IDs are already in
   `docs/chat-exports/analysis/reviewed-sessions.json` and logs
   `Skipping N already-reviewed session(s)`. If you want to re-baseline
   the full corpus (e.g. you tightened a heuristic and want to compare
   pre/post numbers across cohorts), pass `--include-reviewed`:

   ```powershell
   node scripts/analyze-chat-exports.mjs --include-reviewed
   ```

   This regenerates `metrics.json`, `metrics-summary.md`, and
   `metrics-by-era.json` against every transcript on disk.

3. **Read outputs in order.** Open and skim:
   1. `docs/chat-exports/analysis/metrics-summary.md` — top-line
      dashboard, per-category aggregates, per-session table.
   2. `docs/chat-exports/analysis/metrics-by-era.json` — per-session
      era tags (`activeRules` / `activePractices` / `activeInfra`
      sourced from `workflow-change-log.json`) and per-cohort
      aggregates. Use this to ask *"are sessions with rule X in their
      active set actually exhibiting lower friction than sessions
      without it?"* Phase 2 has no UI on top of this file yet — Phase 3
      will add the static-HTML cohort dashboard. For now, eyeball the
      `cohorts[]` array (sorted by sessionCount desc).
   3. `docs/chat-exports/analysis/worst-3/*.md` — friction digests for
      the 3 highest-friction-score sessions (negation × 2 + repeated
      failures).
   4. `docs/chat-exports/analysis/deep-dive-this-session.md` (only if
      `--deep-dive` was passed) — turn-by-turn annotated walk.

4. **Eyeball before believing.** The detectors are heuristics:
   - "Negation events" matches `\b(no|wait|stop|actually|wrong|...)\b`
     case-insensitive — terminal echoes containing those words inflate
     the count. Cross-reference with the actual quote in the digest.
   - "Grep-for-symbol" matches `grep_search` calls whose first query
     token looks CamelCase / `useXxx` / camelCase. Skim a sample to
     confirm before claiming a violation count.
   - "Scope expand" matches phrases like "also added" / "bonus" /
     "on top of" — most hits are real, but a few are quotes of the
     user's own message.

5. **Distill 3-5 actionable patterns.** From the worst-3 digests, pick
   patterns that recur across multiple sessions. Single-session quirks
   are not workflow problems.

6. **Ship the workflow edits as small ETC commits.** Each rule
   tightening goes in its own commit so it can be reverted independently
   if it causes a regression in future-session ergonomics. Edit targets:
   - `.github/instructions/compliance.instructions.md` for tool-discipline gates
   - `.github/instructions/persistence.instructions.md` for handoff/memory gates
   - `.github/instructions/structural.instructions.md` for scope-discipline
   - new `docs/workflows/<slug>.md` if the fix is a procedure not a rule

   **6a. Sync each rule edit into `workflow-change-log.json`
   (ADR-0036 D6).** For every `.github/instructions/*.md` change you
   commit in step 6, append one entry to the `agentRuleEdits` stream of
   `docs/chat-exports/analysis/workflow-change-log.json`:

   ```json
   {
     "id": "<file-slug>:<rule-slug>",
     "shippedAt": "<ISO timestamp of the commit>",
     "commit": "<short sha>",
     "file": ".github/instructions/<file>.md",
     "summary": "<1-line>",
     "triggerSession": "<current session id>"
   }
   ```

   `id` is the canonical handle the analyzer hashes into cohorts —
   reuse it in `reviewed-sessions.json.rulesShippedAfter` (step 7) so
   cohort attribution stays consistent. This file IS tracked in git
   (the lone exception in `docs/chat-exports/`); commit it alongside
   the instruction-file edit or in the wrap commit, but do NOT delay
   beyond the same session — the Handoff Architect's field #9
   self-attribution rule will flag missing entries.

7. **Append the review to `workflow-reviews.json`** so the cadence
   reminder (in `compliance.instructions.md` Phase 0 prelude + Handoff
   Architect Phase 4 field 8) sees the review. Schema:

   ```json
   {
     "reviewedAt": "<ISO timestamp>",
     "sessionId": "<current session id, from filename of active transcript>",
     "summary": "<1-line: what era of friction did this review surface>",
     "ruleEditsShipped": ["<file-slug>:<rule-slug>", ...],
     "commits": ["<short sha>", ...]
   }
   ```

   Append, do not overwrite. The file is gitignored (under
   `docs/chat-exports/`) so this is a local-only mutation — no commit
   required. If the file does not exist yet, create it with a one-element
   array.

8. **Mark the reviewed sessions in the ledger.** Final step of the
   recipe — closes the loop so the next `node scripts/analyze-chat-exports.mjs`
   call (without flags) won't re-analyze the same transcripts:

   ```powershell
   node scripts/analyze-chat-exports.mjs --include-reviewed --mark-reviewed
   ```

   Idempotent: re-running adds zero new entries. The ledger is
   gitignored (per-machine, ADR-0036 D5). Use the `rulesShippedAfter`
   field of each new entry to record which rule IDs (from step 6a)
   were introduced *as a consequence of* this review — this is the
   primary lineage for Phase 3's per-cohort regression analysis.

## First-Attempt Failures

- **Chronicle store was empty** — the local SQLite session index
  registered 51 sessions but never populated turn content from the debug
  logs. Bypass it entirely; read the JSONL transcripts directly.
- **PowerShell printing JSONL line slices truncated output and swallowed
  console writes** — switched to `node -e "..."` one-liners for the
  schema-probe phase.
- **Tried to detect "user negation" purely from regex** — got a lot of
  false positives from terminal output reflected back as user messages.
  Mitigation: the analyzer captures the full quote in each digest so the
  reader can dismiss noise. Don't try to filter terminal echoes in the
  detector itself; that's the human's job at step 4.
- **Markdownlint MD060 on aligned-style tables** in the summary doc —
  fixed by using compact single-space `| - | - |` separator rows in the
  generated dashboard.

## Gotchas

- The script is **read-only** — it never mutates raw transcripts. Safe
  to run repeatedly.
- `docs/chat-exports/` is gitignored. Outputs do NOT land in the repo.
  Commit only the script (`scripts/analyze-chat-exports.mjs`) and the
  `.gitignore` rule, not the data.
- The grep-for-symbol detector treats only the **first whitespace-split
  token** of the query as a candidate symbol. Multi-word grep queries
  ("foo bar", "TODO: refactor") are correctly skipped.
- Outlier mega-sessions (multi-day) inflate every absolute count. When
  surfacing findings, always normalize per-session or per-1000-tool-calls
  so a single 11-day session doesn't dominate the verdict.
- The deep-dive output can be large (~20-50 KB for an active session).
  Use it surgically — only when you need turn-level resolution.
- Heuristic regex is intentionally conservative. Real friction usually
  shows up in the *quotes*, not the *counts*. Read the digests.
