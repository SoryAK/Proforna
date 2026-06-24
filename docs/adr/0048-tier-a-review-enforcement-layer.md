# 0048 — Tier A review enforcement layer (lefthook + Semgrep + Dependabot)

## Status

Proposed (2026-06-24)

## Context

ADR-0047 ratified the three-column review pipeline (Column 1 deterministic `review:phase`, Column 2 semantic `review:semantic`, Column 3 commit-based subagent review). All three columns existed but ALL THREE depended on human discipline for invocation:

- Column 1 only ran when the user remembered to type `npm run review:phase` before pushing.
- Column 2 only ran when the user remembered to launch the local LLM flow.
- Column 3 only ran when the user dropped into the workflow on review day.

Today's session opened with a strategy question: *"what should we build to make this review process battle-tested and effective?"* The honest gap analysis showed that the rigor existed on paper but enforcement was missing — i.e. the gap between "we have a gate" and "the gate cannot be skipped." Industry-standard tools (CodeRabbit, Greptile, CI runners, branch protection) target multi-contributor PR-based workflows and don't fit a solo-dev push-to-main shop. The actual leverage gap was **automation/enforcement of EXISTING rigor**, not new layers.

Three Tier A enforcement layers were identified as highest-leverage:

1. **Pre-push hook** that runs `review:phase` automatically — closes the "I forgot to test before pushing" failure mode.
2. **Semgrep with codified slice-trap rules** — moves known traps (e.g. `window.prompt()` blocked in React 19, `DropdownMenuItem onSelect` is a Radix leak) from Column 2 (LLM, variable cost) to Column 1 (deterministic, free, repo-wide).
3. **Dependabot** for dependency hygiene — already-supported by GitHub at no cost.

Tiers B/C/D were considered and explicitly deferred with documented re-entry triggers (`/memories/repo/parked-ideas.md`).

## Decision

Adopt three Tier A enforcement layers as ratified additions to the review pipeline:

1. **lefthook** as the git-hook runner (`lefthook.yml` at repo root). Pre-push stage runs `npm run review:phase`. Single Job, single command, non-parallel. Bypass via `git push --no-verify` documented for emergency.

2. **Semgrep Community** as the codified-trap rule engine. Rules live under `semgrep/rules/*.yml`, scoped by the same trap-pattern philosophy as `docs/c-yard/<slice>.json` `knownTrap` arrays. Wrapper script at `scripts/review-semgrep.mjs` resolves Semgrep cross-platform (PATH → pipx home → `~/.local/bin`), passes `--severity ERROR --error` so WARNINGs surface debt without blocking pushes. Semgrep runs as a hard-fail pre-step inside `review-phase.mjs`, before the slower OSS gates.

3. **Dependabot** via `.github/dependabot.yml` — npm and GitHub Actions ecosystems, weekly grouped minor+patch updates, majors ignored (no surprise `next@17` mid-sprint), security advisories bypass the schedule.

Three seed Semgrep rules ship with this ADR to prove the wire-up:

- `no-window-prompt.yml` (WARNING — 56 existing callsites tracked as Tier B4 debt in `parked-ideas.md`).
- `no-radix-onselect.yml` (ERROR — zero existing violations).
- `no-dropdown-trigger-onclick.yml` (ERROR — zero existing violations).

Promotion path for WARNING rules: clean up existing callsites → flip `severity: WARNING` → `severity: ERROR` in a single-line edit. The rule then permanently locks out the entire bug class.

## Consequences

### Pros

- **Enforcement, not discipline.** Pre-push hook makes `review:phase` non-optional. Eliminates the "forgot to test" failure mode that ETC previously depended on user willpower for.
- **Slice traps become deterministic.** Patterns previously caught only by Column 2 (LLM, slow, costly, non-deterministic) become Column 1 (instant, free, repo-wide). Each codified rule is a permanent regression-prevention layer that catches the trap forever after, across every file.
- **Free dependency hygiene.** Dependabot is GitHub-native, zero infra. Weekly grouped PRs keep noise low while security advisories flow immediately.
- **No new abstraction surface.** All three layers are off-the-shelf OSS tools (lefthook, Semgrep, Dependabot) — none of them introduce a new build system, language, or runtime.
- **Cohesive with parked tiers.** B/C/D layers (coverage gate, commit-msg trailers, group-coordination tooling like CodeRabbit/CI, longitudinal observability) all have re-entry triggers documented in `parked-ideas.md`; the next review day can work the whole picture.

### Cons / Trade-offs

- **Pre-push hook adds ~170s to every `git push`.** Mitigated by the fact that pushes are deliberate events (the user said this explicitly in the strategy conversation). Emergency bypass exists via `--no-verify`.
- **Semgrep introduces a Python dependency.** Installed via `pipx`, isolated from system Python, but it's a second runtime in the dev stack. Mitigated by the cross-platform wrapper script that finds the binary regardless of PATH state.
- **Three seed rules is a small surface.** Most of the slice traps in `c-yard/*.json` and the memory notes are NOT yet codified — those remain in Column 2 (LLM-caught) until each is converted into a Semgrep rule. Per parked-ideas, this is an ongoing ratchet, not a one-time migration.
- **The 56 `prompt/confirm/alert` debt callsites** are now visible as Semgrep WARNINGs on every push. Mild ambient nag — see parked-ideas Tier B4 for the opportunistic cleanup plan.

## References

- ADR-0047 — three-column review pipeline (this ADR extends Column 1).
- ADR-0018 — TDD as a first-class skill (compatible — Tier A enforces the gate, doesn't change the testing model).
- `/memories/repo/parked-ideas.md` — Tier B/C/D parked with explicit re-entry triggers.
- `docs/workflows/add-review-enforcement-layer.md` — recipe to add a new enforcement layer (lefthook hook OR Semgrep rule).
- Commits shipping this decision: `7c7202a`.
