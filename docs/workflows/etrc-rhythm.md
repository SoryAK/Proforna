# Workflow: ETRC Rhythm

## Workflow Type

`etrc-rhythm` — the project's default ship rhythm for any focused change. Replaces the bare E→T→C user-memory pattern with mechanical commit-time classification + design-review queueing. Ratified in ADR-0049.

## Stack Context

- **lefthook 2.1.9** (`npm i -D lefthook`, `npx lefthook install`) — git-hook runner
- **Ollama** with `gemma4:26b` at `http://localhost:11434` — local R model
- **Node 22+ ESM** (`.mjs`) scripts at `scripts/review-*.mjs`
- **Append-only JSONL queue** at `docs/review-queue.jsonl` (gitignored)
- PowerShell on Windows (OneDrive-synced repo — y/n loop hazard)

## Successful Sequence

### Day-to-day: how to use the rhythm

1. **Execute** — make the focused edit as a single atomic change. Don't bundle unrelated work.
2. **Test** — run `get_errors` on every modified file, then `npm test 2>&1 | Select-Object -Last 12`. If the change is UI-observable, browser-verify the live page.
3. **(Auto) Classify** — happens automatically in post-commit. Nothing to do.
4. **(Auto) Review** — for risky-tier commits ONLY, gemma4 runs in the background via the post-commit hook. Result lands in the queue ~30–120s after the commit.
5. **Commit** — use the OneDrive-safe heredoc pattern:

   ```pwsh
   @'
   feat(area): one-line subject

   Body if multi-line.
   '@ | Out-File -Encoding utf8 .git/CMSG; git add <files>; git -c gc.auto=0 commit -F .git/CMSG
   ```

   The post-commit hook fires automatically — typical latency 0.2–0.4s for trivial/standard, instant for risky (R is detached). The commit completes BEFORE R finishes.
6. **Move on.** Don't wait for R. If you need to know what R said, check `npm run review:queue --tier risky` later, or `npm run review:escalate <sha>` to manually re-review.

### Review day: process the queue

Default cadence is weekly. Scope the queue to the last 7 days so review attention stays on what actually landed this week — older commits have already been reviewed (or deliberately deferred) and re-surfacing them is noise.

1. `npm run review:queue -- --tier risky --since 7days` → focus deep attention. Run Column 2/3 review per ADR-0047 on each. Look at the R-local result inline — if it suggested an extract/move/reuse and you agree, queue a fix-up commit in the next cycle.
2. `npm run review:queue -- --tier standard --since 7days` → spot-check ~1 in 3. Pick the ones with the largest LOC or unfamiliar areas.
3. `npm run review:queue -- --tier trivial --since 7days` → glance only. Confirm classifier wasn't fooled (e.g. a `chore(scripts):` that actually does something).
4. For any commit where R said `skipped:empty-response` or `skipped:ollama-*` and you want a second opinion: `npm run review:escalate <sha>` and paste the output into a premium subagent invocation.

`--since` also accepts an ISO date (`2026-06-24`), a longer relative window (`30days`, `2w`), or a git SHA (cutoff = that commit's committer date) — pick whichever frames the review you want. Omit `--since` entirely to see the full queue history.

### Adding a new risky-tier trigger (when a new high-blast-radius pattern emerges)

1. Edit `RISKY_PATH_PATTERNS` in `scripts/review-classify.mjs`. Add the regex.
2. Test against a known-violating commit: `node scripts/review-classify.mjs <sha>` should return `tier:"risky"` with the new pattern in `reasons`.
3. Document the addition in the ADR-0049 promotion-candidates list with the trigger date and a one-line rationale.
4. Optional: add the pattern to the "expanded risky-tier heuristics" section of `docs/workflows/add-review-enforcement-layer.md` for future reference.

### Tuning the R-local prompt (when the v1 prompt drifts into noise or stays empty too often)

1. Pull 5–10 recent risky-commit entries: `npm run review:queue -- --tier risky --since 30days --json | jq '.[].reviews'`.
2. Identify the failure mode: too many `skipped:empty-response`? Too generic suggestions? Off-scope feedback?
3. Edit `PROMPT_TEMPLATE` in `scripts/review-r-local.mjs`. Keep the contract: ≤80 chars or `clean`. Don't broaden scope without bumping `MAX_RESPONSE_CHARS` and re-reviewing review-day signal quality.
4. Smoke-test against a recent risky SHA: `node scripts/review-r-local.mjs $(git rev-parse <sha>)` and inspect the queue line.

## First-Attempt Failures

1. **Windows cmd.exe ate the `^` in `${sha}^{commit}` git refs.** Initial classifier used `git rev-parse --verify ${sha}^{commit}` (the canonical tag-deref pattern). PowerShell's `execSync` shell=true on Windows passed it through cmd.exe, which interpreted `^` as the escape character — git saw `<sha>{commit}` and threw "ambiguous argument". **Fix**: drop the `^{commit}` suffix entirely. For plain commit SHAs, `git rev-parse --verify <sha>` is sufficient; the suffix is only needed for tag dereferencing.
2. **Lefthook `{ref}` template doesn't resolve for post-commit hooks.** Initial `lefthook.yml` had `run: node scripts/review-log.mjs {ref}` — the literal string `{ref}` was passed to my script, which then tried to classify a non-existent SHA. The `{ref}` placeholder only works for `pre-push` / `pre-receive` hooks where ref data comes via stdin. **Fix**: drop the arg; my script defaults to HEAD, which IS the just-landed commit in post-commit context. The hard contract held (script logged `tier:"unknown"` and exited 0, commit was not blocked), but the queue entry was junk until backfilled manually.
3. **R-local emitting `skipped:empty-response` on small risky commits.** Today's two risky commits — a 17-LOC schema migration and a 684-LOC feature ship — both returned empty from gemma4. The model neither said "clean" nor produced a suggestion. **Diagnosis (deferred to v2)**: prompt may be too restrictive ("ONLY structural improvements, ONLY if you see one clear one") combined with small diffs that genuinely have no structural improvement opportunity. **Workaround**: the failure is logged, joinable, and reviewable on review day; escalation to premium is one command away.

## Gotchas

- **The post-commit hook fires on EVERY commit, including amend/rebase/squash.** Acceptable for solo-dev; the queue just accumulates more entries (each amend logs a new line for the new SHA). Reader joins by full SHA so the old amended-out SHA's review still appears under that SHA — minor noise, not a problem.
- **`docs/review-queue.jsonl` is gitignored.** Per-machine, per-checkout. If you work across two machines, the queues don't merge. The commits themselves are the canonical artifact in git; the queue is derived data.
- **R-local takes ~30–120s.** It runs detached from the commit, so you don't wait. But if you commit, then immediately run `npm run review:queue --tier risky`, you may see `rPending:true` with no review yet — that's expected. Run again in a minute.
- **Hook latency budget.** The post-commit logger budget is ~0.5s wall-clock (Node spawn + classifier + JSONL append). Measured at 0.24–0.33s for trivial/standard commits. If this ever creeps above 1s noticeably, the classifier has bloated and needs profiling — it should be pure path-pattern + `git show --shortstat` arithmetic.
- **Lefthook bypass.** `git commit --no-verify` skips the post-commit hook entirely. Don't use this — the queue exists to catch what you forget. The hook is non-blocking by design, so there's no legitimate reason to bypass it.
- **The hook spawns Node twice per commit on a risky tier.** Once for the logger, once for R-local (detached). On extremely constrained machines this could feel laggy. Not observed on dev hardware (Strix Halo + 64GB).
- **Ollama dependency.** When the local Ollama service is down (or `gemma4:26b` isn't pulled), R-local logs `skipped:ollama-unavailable` for every risky commit. The queue stays accurate; only the R signal is missing. Re-run R-local manually after Ollama is back: `node scripts/review-r-local.mjs $(git rev-parse <sha>)`.

## Last Updated

2026-06-24 — initial recipe shipped alongside ADR-0049 (ETRC rhythm and commit queue).
