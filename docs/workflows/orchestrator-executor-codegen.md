# Orchestrator-Executor Codegen with Local Ollama

**Workflow Type:** `orchestrator-executor-codegen`
**Last Updated:** 2026-06-14

## Stack Context

- Local Ollama daemon at `http://localhost:11434` (verify: `ollama list`).
- Model: `gemma4:26b` (17 GB, native function-calling, **the only Ollama
  model in this repo that produces clean code in one shot**).
- `scripts/ollama-codegen.ps1` — PowerShell orchestrator. POSTs spec to
  `/api/generate` (stream=false, temp 0.2, 600s timeout), extracts fenced
  TypeScript blocks via regex, writes UTF-8 no-BOM files, runs a test
  command, and feeds failure tails back as a repair prompt up to
  `-MaxAttempts` (default 3).
- Vitest 4.1.0 — `npx vitest run <path>` returns non-zero on failure,
  which is what the loop branches on.
- No VS Code extension. No Cline. No Continue. Just stdio + HTTP.

## When this recipe applies

You have a **fully nailed spec** for a small unit — typically a pure
utility, a TDD GREEN step, or a mechanical edit — and you want Copilot
to spend its premium turns on the spec, NOT on typing the
implementation. The script burns local GPU time (free) and your Copilot
turn count drops to one (spec drafting) + one (review).

This is **not** the right tool when:
- The spec is half the work (architectural / multi-file refactors).
- You need to read code mid-implementation (use Cline + codegraph MCP).
- The output requires UI orchestration (no jsdom in vitest config).

## Successful Sequence

1. **Draft the spec in Copilot.** Be explicit about:
   - Exact export signature(s).
   - All edge cases as enumerated bullet points (don't say "etc.").
   - Style rules the model habitually fumbles: double vs single quotes,
     `\u2026` literally as the escape sequence vs the rendered glyph,
     `.slice()` vs `.substring()` (gemma4 defaults to `.substring`).
   - **One fenced code block per output file, in the same order as
     `-OutFiles`.** The regex extractor relies on this exactly.

2. **Wipe stale outputs.** The script overwrites, but pre-wiping
   guarantees the test failure is "module not found" if extraction
   misses a block — which surfaces faster than a stale-test pass.

   ```powershell
   Remove-Item src\lib\foo.ts, src\lib\foo.test.ts -Force -ErrorAction SilentlyContinue
   ```

3. **Invoke the script.** Pass the spec as a here-string:

   ```powershell
   $spec = @'
   Write TWO TypeScript files...
   '@
   ./scripts/ollama-codegen.ps1 `
     -Spec $spec `
     -OutFiles "src/lib/foo.ts","src/lib/foo.test.ts" `
     -TestCommand "npx vitest run src/lib/foo.test.ts"
   ```

   First gemma4 pass typically takes 90–150s on Strix Halo. Reported on
   the console as `Ollama: Xs, response Y chars`.

4. **Read the script's exit code.**
   - `0` → tests passed. Last 8 lines of vitest output are printed.
     Skim to confirm pass count matches the spec.
   - `1` → exhausted `-MaxAttempts` without green tests. Read the
     console output (last repair prompt + last test tail are visible)
     and either tighten the spec or finish by hand.
   - `2` → model returned fewer code blocks than `-OutFiles`. Surface
     the raw response and add to your spec: "Output exactly N fenced
     typescript blocks, no prose between them."

5. **Review the generated code.** Even on green tests, gemma4 produces
   plausible-but-non-idiomatic code (e.g. `String.prototype.search`
   instead of `lastIndexOf`). Treat the script's PASS as a TDD GREEN —
   you still own the REFACTOR step.

6. **Commit using the E→T→C rhythm** (see user-profile.md):
   - `get_errors` on each modified file.
   - `npm test 2>&1 | Select-Object -Last 12` (full suite, not just the
     new file).
   - Heredoc → `Out-File .git/COMMIT_MSG_TMP` → `git -c gc.auto=0 commit
     -F .git/COMMIT_MSG_TMP`.

## Validation Reference (2026-06-14)

- Target: `src/lib/truncate-to-word-boundary.ts` + `.test.ts`
  (function + 9 vitest cases).
- Result: PASS in **1 attempt**, **123.8s** total. Files written, all 9
  tests green on first invocation.
- Spec included the same gotcha-list (`\u2026`, `.slice`, double quotes)
  that broke gemma4 in the earlier manual REPL rounds. Putting the
  rules in the spec front-loaded the fix.

## Known Failure Modes

- **gemma4 ignores a single bullet.** Catch on review. The repair loop
  CAN catch test-visible bugs but won't fix style violations the tests
  don't assert.
- **PowerShell BOM**. `Set-Content` would write a BOM that TypeScript
  warns on. The script uses `[System.IO.File]::WriteAllText` with
  `[System.Text.UTF8Encoding]::new($false)` to avoid this on both
  Windows PowerShell 5.1 and pwsh 7+.
- **OneDrive lock during write**. Extremely rare during this workflow
  (only the two target files churn), but if it happens, kill the
  terminal and retry — the script is idempotent.
- **Daemon cold-start**. First call after a reboot loads the model into
  VRAM (~30s extra). Subsequent calls are immediate.

## Why this beats the Cline path for this class of work

- **No UI overhead.** Cline's webview + tool-call XML parsing costs
  seconds per turn. The script is one HTTP round-trip.
- **Deterministic exit code.** `$LASTEXITCODE` from `npx vitest` is
  trivially scriptable; Cline's "did the task pass" signal is harder.
- **Reproducible.** Re-run with the same `$spec` to compare model
  outputs across temperature/model swaps.

The Cline+gemma4+MCP path stays the answer when you need codegraph
lookups *mid-task* (impact analysis, callers, file reads). This script
is the answer when you can hand gemma4 a closed-form spec.
