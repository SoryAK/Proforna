# Workflow: Setup a Phase-End Review Gate

## Workflow Type

`setup-phase-end-review-gate` — bootstrap a deterministic OSS regression gate against a tracked baseline. This is column 1 of the three-column review pipeline (ADR-0047).

## Stack Context

- Node 22+ with ESM (`.mjs` scripts)
- OSS gates: `tsc`, `eslint` (flat config), `knip`, `madge`, `vitest`
- PowerShell on Windows (OneDrive-synced repo — y/n loop hazard on commits)
- npm scripts as user-facing entry points

## Successful Sequence

1. **Calibrate gates first.** Before the gate is useful, each gate must produce honest counts. If eslint is reporting "1219 errors" via inflated `recommended.rules` spreads, the gate locks in noise as the baseline. Triage gate calibration as a prerequisite (this session: commit `ef75099` cleared the surface — 1219 inflated eslint counts → 495 real errors, 22 tsc errors enumerated, 0 knip / madge / vitest.failed). Commit calibration separately from the gate itself.
2. **Pick the smallest numeric summary per gate.** What represents this gate's state in one or two integers?
   - `tsc --noEmit` → count of `/error TS\d+:/g` matches in stdout+stderr
   - `eslint --format json .` → count of messages with `severity === 2` (errors) vs others (warnings). Strip Babel banner prefix before first `[`.
   - `knip --reporter json` → sum of `issues[].files / .dependencies / .devDependencies` lengths. Strip prefix before first `{`.
   - `madge --circular --extensions ts,tsx src` → regex `Found (\d+) circular`, falling back to 0 on "No circular".
   - `vitest run` → regex `/Tests\s+([\d\w\s|]+?)\s*\((\d+)\)/` then split chunks on `|` and extract `(\d+)\s+(passed|skipped|failed)`. Robust across vitest versions where `--reporter=json` is fragile.
3. **Build the orchestrator** at `scripts/review-phase.mjs`. Self-contained — spawns each gate with `spawnSync`, parses output into structured `{ tsc, eslint, knip, madge, vitest }`, compares against baseline JSON. Sentinel `-1` for parser failures triggers exit 2 (infra error, distinct from regression).
4. **Define the regression policy** in code:
   - Default: strict — any gate count > baseline → exit 1
   - `--accept-net` flag: per-gate regressions allowed if `sum(current) <= sum(baseline)` across all numeric gates
   - `vitest.failed > 0` is a hard fail in ALL modes (no opt-out)
   - `--write-baseline` flag: captures current state, writes to baseline file, exits 0
5. **Add npm scripts** in `package.json`:

   ```jsonc
   "review:phase": "node scripts/review-phase.mjs",
   "review:baseline": "node scripts/review-phase.mjs --write-baseline"
   ```

6. **Capture initial baseline.** `npm run review:baseline` on a clean post-calibration commit. Commit the resulting `docs/review-baseline.json` (versioned, includes `commit` SHA + `capturedAt` ISO timestamp for auditability).
7. **Red-team verify the gate has teeth.** Inject a contrived regression (e.g. `src/lib/_phase-gate-redteam.ts` with `const x: any = 1; export default x;`). Run `npm run review:phase`. Expect exit 1 with at least one gate flagged (this session: eslint +1, knip +1 — defense in depth). Remove the file. Re-run. Expect exit 0 with all deltas at zero. **Without this step you have a gate of unknown sensitivity.**
8. **Wire into the ship rhythm.** Update user memory: `E→T→C` becomes `E→T→R→C` with R = `npm run review:phase`. Define when R is required (phase-end / pre-push / ADR-shipping / cross-cutting libs / schemas / config) and when R is optional (single-file UI / docs / scratch — T still required).

## First-Attempt Failures

- **`vitest --reporter=json`** mixes prose + JSON on stdout in vitest 4.x and breaks naive `JSON.parse`. Switched to regex on the human-readable summary line. Robust across versions.
- **`eslint --format json`** prefixes the JSON array with a Babel banner from the config loader. Always strip everything before the first `[` before `JSON.parse`.
- **PowerShell multi-line heredocs over a single `run_in_terminal` call** can leave the terminal in continuation mode if the agent submits before the heredoc is closed. Workaround: send `Out-File`-style commands for commit messages, or split the long heredoc into two single-line commands. Verify state with a follow-up `git status` if the output looks truncated.
- **`mode='sync'` calls > 2 minutes** can return truncated output even on completion. Run red-team RED and GREEN as separate sync calls; check `$LASTEXITCODE` explicitly. Don't chain them into one `;`-separated command and trust the trailing prints.

## Gotchas

- **Baseline maintenance discipline.** When intentional improvements land, regenerate the baseline via `npm run review:baseline` and commit. Forgetting leaves the bar artificially high — every subsequent commit appears as a "regression" until someone re-snapshots.
- **Knip orphan detection is aggressive.** Any unimported file under `src/` will flag (caught the red-team probe). For opt-out, use the project's `knip.json` config or rely on `.test.ts` / `.config.*` extensions which knip's defaults usually exempt.
- **Madge needs `--extensions ts,tsx`** explicitly on TypeScript repos. Default extension list misses `.tsx`. Without it, circular dep counts are silently wrong.
- **Gate wall-clock cost (~170s)** is non-trivial. Acceptable for phase-end commits, painful as a pre-commit hook. Carve out "R-optional" cases in the ship rhythm rules; consider a faster `review:quick` later if needed.
- **OneDrive y/n loop on commit.** Use `git -c gc.auto=0 commit -F .git/COMMIT_MSG_TMP` (heredoc → Out-File → commit-F → cleanup) to bypass.
- **Tool-installer cost.** First run of each `npx` invocation hits the npm registry. CI or first-time-on-machine runs add ~30-60s on top of the gate runtime. Pre-warm `node_modules` before benchmarking.

## Last Updated

2026-06-23
