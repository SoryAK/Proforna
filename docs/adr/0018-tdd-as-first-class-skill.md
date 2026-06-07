# TDD as a First-Class Skill in the Execution Pipeline

- **Status:** Accepted
- **Date:** 2026-06-07
- **Deciders:** Sory
- **Tags:** process, testing, agent-instructions

## Context and Problem Statement

A comparison with `obra/superpowers` (a multi-harness agentic skills framework) surfaced one large, defensible gap in the Resumsify Elite Engineering Agent setup: **no test-driven development discipline exists.** The pipeline enforces structural review, security review, architectural trade-off articulation, performance review, UI critique, persistence, and handoff — but production logic can ship without ever writing a test, and the agent has no built-in resistance to the rationalizations ("I'll add the test after," "It's a one-liner," "I already manually tested it") that make tests-after-the-fact slip silently.

Vitest is already a dependency (`^4.1.0`) and the `vitest.config.ts` is wired to `src/**/*.test.ts`. Nine test files exist (`src/lib/worklog/**`, `src/app/api/work-logs/**`, etc.), proving the pattern works in this codebase. There was no `npm test` script exposed and no instruction file telling the agent *when* tests are mandatory and *how* to write them.

## Decision Drivers

- **Close the gap surfaced by the superpowers comparison** without adopting their multi-harness or domain-rejecting baggage.
- **Fit the existing pipeline shape** (Phases 0–4) rather than reorder it.
- **Respect what's already working** — vitest, the test file convention, the manual UI test sheet (`TESTING.md`).
- **Don't break UI work** — the React + Tiptap + base-ui surface has no jsdom/component-test setup, and forcing TDD on `*.tsx` would block all UI work.
- **Match the agent's existing tone** — HARD GATEs, FORBIDDEN patterns, compliance failures — so the new skill reads consistent with `compliance.instructions.md` and `persistence.instructions.md`.

## Considered Options

### Scope of the `applyTo` glob

- **A. Logic-only** — `src/lib/**`, `src/app/api/**`, `src/data/**`. Matches existing vitest scope.
- **B. All TS** — `src/**/*.ts`. Wider net; some component-adjacent files get caught.
- **C. All including UI** — `src/**/*.{ts,tsx}`. Rigid; would block UI work because we have no component-test infra.

### Retroactivity on existing untested code

- **A. Forward-only** — TDD mandatory only for new files / new exported functions.
- **B. Strict (superpowers stance)** — Touching any function without a test = first write the test, then modify.
- **C. Bug-fix retroactive** — New feature = TDD always. Bug fix on existing code = write failing test reproducing the bug first. Pure modifications without a bug = encouraged but not blocking.

### Phase placement

- **A. New Phase 2.5** — Between System Integrity (security/architectural review) and Logic & UX Validation. RED → implement → GREEN → REFACTOR sits where code generation actually happens.
- **B. Inside Phase 3** — Folds TDD under Logic & UX Validation. But TDD must precede ALL logic code, including code that performance review would shape, so this is too late.
- **C. Inside Phase 1** — Too early. Architecture/structure decisions haven't landed yet, the test would test the wrong thing.

## Decision Outcome

**Chosen: 1A + 2C + 3A.**

- **1A — Logic-only scope.** `applyTo: "src/lib/**/*.ts,src/app/api/**/*.ts,src/data/**/*.ts"`. Matches existing vitest convention, leaves UI work to the manual test sheet + UI/UX Critic skill.
- **2C — Bug-fix retroactive.** New features and bug fixes both require TDD. Pure refactors of untested code are encouraged but not blocking — keeps the bar high without making the codebase unworkable.
- **3A — New Phase 2.5.** Inserted between Phase 2 (System Integrity) and Phase 3 (Logic & UX Validation). The RED-GREEN-REFACTOR cycle now has a real seat in the pipeline router.

A new instruction file `.github/instructions/testing.instructions.md` was created with five skills:

1. **TDD Iron Law** — defines the trigger boundary (new logic + bug fixes mandatory; pure refactor + types-only optional).
2. **RED-GREEN-REFACTOR Cycle** — the canonical loop with mandatory verify steps after RED and GREEN.
3. **Bug-Fix Test-First** — every regression starts with a failing reproduction test that stays in the suite as a regression guard.
4. **TDD Red Flags & Rationalizations** — a 10-row table of common rationalizations and their realities, borrowed in shape from superpowers' anti-slop posture.
5. **Verification Checklist** — per-change box-list before declaring TDD-scoped work complete.

Two `package.json` scripts were added so the skill can reference real commands:

```json
"test": "vitest run",
"test:watch": "vitest"
```

The pipeline router (`.github/copilot-instructions.md`) gained a Phase 2.5 entry pointing at `testing.instructions.md`.

### Positive Consequences

- Agent now has a defensible, codified TDD discipline with explicit failure modes and rationalization-detection.
- Pattern matches the existing instruction-file shape — same tone, same gates, same compliance-failure language.
- The Red Flags table is reusable as a template for hardening other instruction files (Compliance, Logic).
- Bug fixes get regression-guard tests as a side effect of the workflow — long-term defect rate should drop.
- `npm test` is now a documented, scripted entry point — removes a small onboarding stub.

### Negative Consequences

- **More work per logic change.** New endpoints, new lib helpers, new data-layer functions all incur a test-first round-trip. Honest cost.
- **Boundary disputes will happen.** "Is this 'pure refactor' or 'behavior change'?" will need judgment calls. The Red Flags table covers the common rationalizations but won't catch all of them.
- **No UI coverage.** UI logic that lives inside `*.tsx` (effects, reducers, callbacks) is still uncovered by automated tests. Future ADR may add a component-test stack (jsdom + @testing-library/react), but that's a separate decision.
- **Existing untested logic stays uncovered.** Forward-only retroactivity (option 2C) means files like `worklog-folders.ts` get tests when touched, not as a backfill sweep. This is deliberate but means coverage grows slowly.

## Pros and Cons of the Options

### Option 1A — Logic-only scope

- ✅ Matches existing vitest config exactly.
- ✅ Leaves UI work to the manual test sheet + UI/UX Critic — no infrastructure gap to fill.
- ❌ UI logic embedded in `.tsx` files stays uncovered.

### Option 2C — Bug-fix retroactive

- ✅ Bug fixes get regression guards automatically.
- ✅ New features always have tests.
- ✅ Pure refactors aren't blocked by a backfill demand.
- ❌ Boundary call between "refactor" and "behavior change" will need judgment.

### Option 3A — Phase 2.5

- ✅ TDD sits where code is actually written.
- ✅ Doesn't disrupt Phases 0–2 (orientation, structure, security).
- ✅ Phase 3 (Logic & UX critique) now reviews real, tested code.
- ❌ Adds another phase number to the pipeline — minor cognitive overhead.

## Links / References

- `.github/instructions/testing.instructions.md` — the new skill file.
- `.github/copilot-instructions.md` — Phase 2.5 entry.
- `vitest.config.ts` — test runner configuration.
- `obra/superpowers` `skills/test-driven-development/SKILL.md` — shape inspiration (Iron Law, Red Flags, RED-GREEN-REFACTOR with verify steps). Skill content is Resumsify-original, not copied.
