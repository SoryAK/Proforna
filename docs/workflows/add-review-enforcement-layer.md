# Workflow: Add a Review Enforcement Layer

## Workflow Type

`add-review-enforcement-layer` — wire a new automatic enforcement layer on top of the existing review pipeline (ADR-0047 + ADR-0048). Use this recipe when adding a git hook, a Semgrep rule, a Dependabot ecosystem, or any other automatic gate that protects existing rigor from being skipped.

## Stack Context

- Node 22+ with ESM (`.mjs` scripts)
- npm scripts as entry points
- **lefthook** (`npm i -D lefthook`, `npx lefthook install`) — git-hook runner
- **Semgrep Community** (`python -m pipx install semgrep`) — codified-trap engine, cross-platform via wrapper at `scripts/review-semgrep.mjs`
- **Dependabot** (GitHub-native, configured via `.github/dependabot.yml`)
- PowerShell on Windows (OneDrive-synced repo — y/n loop hazard on commits)

## Successful Sequence

### Adding a lefthook hook (e.g. a new stage like pre-commit)

1. Edit `lefthook.yml` at repo root. Add a new top-level stage key (`pre-commit`, `commit-msg`, etc.) with a `jobs:` list.
2. `npx lefthook install` to regenerate `.git/hooks/*` based on the updated config.
3. Verify the hook file was generated: `Get-Content .git/hooks/<stage> | Select-Object -First 8` should show the lefthook shebang preamble.
4. Test by triggering the relevant git operation with `--dry-run` (or any safe equivalent). Hook should fire, run the job, and gate the operation based on exit code.
5. Document any non-obvious config (timeouts, environment vars) inline in `lefthook.yml` as comments.

### Adding a Semgrep slice-trap rule

1. Identify the trap source: a `knownTrap` in a `docs/c-yard/<slice>.json` manifest, a user memory note (`/memories/`), or a Column 3 finding (`docs/reviews/<sha>-<slug>.md`).
2. Create `semgrep/rules/<kebab-name>.yml` with:
   - `id`: short kebab-case rule id matching the file basename.
   - `pattern-either`: list of literal patterns to match. Use `<JSXTagName ... propName={...}>` for React props, `function.call(...)` for function calls, literals for plain text.
   - `paths.include`: ALWAYS prefix with `**/` to opt into unanchored Semgrepignore-v2 behaviour (e.g. `**/src/**/*.tsx` not `src/**/*.tsx`) — Semgrep emits a warning otherwise and behaviour will change in a future major release.
   - `paths.exclude`: same prefix discipline.
   - `message`: 2-4 line explanation including the canonical fix, with file references to existing correct usage.
   - `severity`: `ERROR` if zero existing violations (rule actively blocks regressions); `WARNING` if existing tech debt would flood the gate (visible surfacing without blocking — promote to ERROR after debt cleanup).
   - `languages`: `[typescript]` covers both `.ts` and `.tsx`. There is NO separate `tsx` language in Semgrep — using it fails rule validation.
   - `metadata.origin`: where the trap was first encountered (memory note date, slice id, review SHA).
   - `metadata.category`: short categorization for grouping (e.g. `react-runtime-guard`, `shadcn-ui-v2-base-ui-guard`).
   - `metadata.debt-note` (WARNING rules only): note the existing-callsite count and the promotion plan.
3. Test the rule fires by running `node scripts/review-semgrep.mjs <file-known-to-violate>` — should print findings. If the rule is ERROR-severity and zero violations exist, run against the whole codebase: `& "$env:USERPROFILE\.local\bin\semgrep.exe" --config semgrep/rules src/ 2>&1` (no `--severity ERROR` filter) and confirm 0 findings expected.
4. The rule is automatically picked up by `npm run review:semgrep` (no script change needed — wrapper reads all of `semgrep/rules/`).
5. Verify the full gate still passes: `npm run review:semgrep` exits 0.
6. If the rule is WARNING and tech debt exists: update `/memories/repo/parked-ideas.md` (or the relevant Tier B/B4-style entry) with the existing-callsite count, fix shapes, and promotion trigger.

### Adding a Dependabot ecosystem

1. Edit `.github/dependabot.yml`. Add a new entry under `updates:` with `package-ecosystem`, `directory`, `schedule`, `groups`, `ignore`, `commit-message`, `labels`.
2. For ecosystems that haven't run before, set `open-pull-requests-limit` low (3-5) initially to avoid PR flood on first run.
3. Use `groups:` to batch minor+patch updates into a single PR. Major bumps should be in `ignore:` for solo-dev workflows (no surprise breakages mid-sprint).
4. Validate the YAML schema by committing it — GitHub validates on push and surfaces errors in the repo Insights → Dependency Graph → Dependabot tab.
5. Activation requires a push to the remote (Dependabot only sees committed config). Pushing the config is the activation event.

## First-Attempt Failures

1. **Semgrep `tsx` is not a valid language.** Initial seed rules used `languages: [typescript, tsx]` (mirroring file-extension thinking). Semgrep rejects this with `unsupported language: tsx. supported languages are: ... typescript ...`. **Fix**: use `[typescript]` only — it covers both `.ts` and `.tsx` files. Re-validate via `--config semgrep/rules src/` direct call.
2. **Semgrep glob warnings.** Patterns like `src/**/*.tsx` emit a deprecation warning that they'll be interpreted as anchored (`/src/**/*.tsx`) in a future Semgrep major. **Fix**: prefix with `**/` everywhere (`**/src/**/*.tsx`) to opt into permanent unanchored behaviour.
3. **Cross-platform PATH for pipx-installed CLIs on Windows.** pipx installs to `%USERPROFILE%\.local\bin\` which is NOT on PATH by default. Calling `semgrep` directly from npm scripts breaks. **Fix**: wrapper script at `scripts/review-semgrep.mjs` resolves the binary by checking PATH first (`where semgrep`), then falling back to `~/.local/bin/semgrep.exe` and `~/.local/pipx/venvs/semgrep/Scripts/semgrep.exe`. Works on any developer machine without requiring shell config edits.
4. **lefthook auto-creates a template `lefthook.yml`** the first time you run `npx lefthook install` if none exists. The template has commented-out example jobs. **Fix**: replace the template with the real config in one edit — don't try to extend the template incrementally (the comment block confuses lefthook's parser intermittently).
5. **Re-baselining `review:phase` is required after wiring Semgrep as a pre-step IF the existing baseline has drifted.** `review:phase` will report regressions accumulated since the baseline was captured, masking the new Semgrep wiring. **Fix**: explicitly run `npm run review:baseline` after wiring Semgrep, committing the new baseline alongside the wire-up. Note the drift sources in the commit message so future archaeology knows why the baseline jumped.

## Gotchas

- **`git push --dry-run` fires the pre-push hook.** Use this to test hook wire-up without actually pushing. Confirmed safe on 2026-06-24 — hook ran, gate passed, no remote was touched.
- **Lefthook hooks run on EVERY push, including pushes to feature branches.** Acceptable for solo-dev workflow; would need scoping (`only: { refs: [main] }`) in multi-contributor mode.
- **Semgrep `--severity ERROR --error` is the correct flag combination** to make the gate exit non-zero ONLY on ERROR-level findings. Without `--severity ERROR`, WARNINGs also count toward `--error`. Without `--error`, even ERROR findings exit 0 (they just print).
- **WARNING-severity Semgrep rules are visible debt-flaggers**, not blockers. They will print on every `npm run review:semgrep` invocation, which is the right pressure level: ambient awareness without push blocking. Promote to ERROR after debt is cleaned up.
- **Dependabot is dormant until first push.** The config file alone doesn't activate it — GitHub needs to see the file at the repo's remote HEAD. In a no-push session (like this one), validation is local-only (YAML syntax) and full activation defers to the next push.

## Last Updated

2026-06-24 — initial recipe shipped alongside ADR-0048 (Tier A enforcement layer).
