---
applyTo: "src/lib/**/*.ts,src/app/api/**/*.ts,src/data/**/*.ts"
---

# Test-Driven Development Skills

These skills apply to **logic code** (`src/lib/**`, `src/app/api/**`, `src/data/**`). They do NOT apply to UI components (`*.tsx`), config files, or generated code. UI behavior is validated through the manual test sheet (`TESTING.md`) and the UI/UX Critic skill.

Tests run via `npm test` (vitest, includes `src/**/*.test.ts`). New tests live next to the file they cover (`foo.ts` → `foo.test.ts`).

---

### Skill: TDD Iron Law

**Rigid skill — follow exactly. Violating the letter of the rules is violating the spirit.**

```
NO NEW PRODUCTION LOGIC WITHOUT A FAILING TEST FIRST
```

**Triggers (mandatory TDD):**
- Adding a new function, route handler, lib helper, or API endpoint in scope.
- Bug fix on existing logic — write a failing test reproducing the bug **before** changing any code.
- Behavior change to an existing function whose signature or return contract is being modified.

**Out of scope (TDD encouraged but not blocking):**
- Pure modification to existing untested code where the change preserves behavior (refactor, type tightening, naming).
- Changes confined to types, JSDoc, or imports.
- Migration scripts, seed scripts, throwaway prototypes.

**No exceptions for "trivial" code without explicit user override.** "It's a one-liner" / "I'll add the test after" / "I already manually tested it" are rationalizations — see the table below.

---

### Skill: RED-GREEN-REFACTOR Cycle

For every triggering change above, follow the cycle. Each verify step is **mandatory** — skipping is a compliance failure.

#### RED — Write the failing test

- One behavior per test. If the name needs "and," split the test.
- Test the **public contract** (input → output, side effect, thrown error). Don't test internal implementation details or mock return values.
- Use real types from the source file. If the test imports types that don't exist yet, that's expected — they will exist in GREEN.

#### Verify RED — Watch it fail

```bash
npm test -- <path-or-pattern>
```

Confirm:
- Test **fails** (assertion mismatch or thrown unimplemented error). Not a syntax/import error.
- Failure message matches what you expected.
- Failure cause is "feature missing," not "typo in test."

If the test passes immediately, you tested existing behavior — fix the test, do not move on.
If the test errors (import/type/syntax), fix the error and re-run until it fails for the right reason.

#### GREEN — Minimal code to pass

- Write the **simplest** code that makes the test pass. No optional parameters, no premature abstraction, no "while I'm here" improvements.
- Don't add features the test doesn't require.
- Don't refactor other code in this step.

#### Verify GREEN — Watch it pass

```bash
npm test
```

Confirm:
- The new test passes.
- All other tests still pass.
- Output is clean — no warnings, no console errors, no unhandled promise rejections.

If anything else broke, fix the production code, never the test, unless the test was wrong (in which case go back to RED).

#### REFACTOR — Clean up (optional)

Only after GREEN. Improve names, extract helpers, remove duplication. Tests must stay green throughout. **No new behavior.** New behavior = new RED.

---

### Skill: Bug-Fix Test-First

When the trigger is a bug report or regression:

1. Write a test that **reproduces the bug** as a failing assertion. The test must fail in exactly the way the user reported.
2. Verify RED — confirm the failure mode matches the bug.
3. Fix the production code (GREEN).
4. Verify GREEN — the bug test passes AND no other test regressed.

The bug test stays in the suite as the regression guard. Never delete it after the fix.

---

### Skill: Schema-Faithful Mocks

When mocking ORM clients (Prisma) or any other typed data-layer client, the mock surface **MUST mirror the real schema**. A mock that silently accepts fields the real model rejects is a test that lies — it ships GREEN while production throws.

**The reference incident (2026-06-22, caught by live smoke, fixed in `7d88b75`):**

`prisma.workHistory.update({ data: { notes: x } })` passed the vitest mock because the hoisted `prismaMock.workHistory.update = vi.fn()` accepted any payload. But the real `WorkHistory` model has `notes WorkHistoryNote[]` — a **relation**, not a scalar column. Prisma threw `PrismaClientValidationError: Unknown field 'notes'` against the real DB. Eight unit tests passed; the dashboard 500'd on every click of "Add to Job Notes" in ADR-0046 Phase D.2.

**Rules:**

1. **Mock only delegates that exist on the real model.** `prisma.workHistory.update` ✓ (delegate exists); `prisma.workHistoryNote.create` ✓; `prisma.workHistory.frobnicate` ✗.
2. **Only pass fields that exist as scalars or composite types on the schema model.** Cross-check by opening `prisma/schema.prisma` for the model under test — NOT by trusting comments, sibling-test patterns, or the slice manifest description.
3. **Relations are not writable through the parent delegate.** `OtherModel[]`, `OtherModel?` (without a foreign-key column on the parent), and back-relations all require operating on the **child** delegate (`prisma.childModel.create({ data: { fkColumn, ... } })`). If the test's mock has a parent-side `update` call that names a relation field, the test will pass while the route 500s.
4. **Use the relation `connect` form when the create payload contains an explicit `id` plus a scalar FK.** Prisma at runtime picks between the **checked** input variant (`<Model>CreateInput`, which exposes relations as nested `xxx: { connect | create | connectOrCreate }`) and the **unchecked** variant (`<Model>UncheckedCreateInput`, which accepts scalar FK columns directly). Passing `{ id: 'x', userId: 'y' }` can trip the validator into the checked variant — which then throws `Argument 'user' is missing` even though the TS type for the unchecked variant accepts your shape. The **connect form is unambiguous in either variant** and is the safe default: `user: { connect: { id: input.userId } }`. Reference incident: ADR-0051 Sprint α' Commit 2, fix in `f3b36df`. Mocks cannot catch this — only live DB integration does.
5. **When in doubt, drive an integration smoke** against the real dev server + DB (Playwright + the running route) before declaring GREEN. Hermetic unit tests catch logic; only integration catches mock-vs-schema drift, variant-selection quirks, and Prisma client cache staleness (see PrismaSchemaOps memory for the OneDrive `prisma generate` recovery loop).

**Red flag:** a route that passes its unit tests but throws `Unknown field`, `Argument not valid`, or `Argument <relation> is missing` against the real DB means the mock surface is lying. The fix order is: (a) correct the mock to mirror schema-truth, (b) re-RED the test, (c) fix the route to make the now-honest test pass — using `connect` form for relation writes when ambiguity is possible.

---

### Skill: TDD Red Flags & Rationalizations

These thoughts mean STOP — you are about to skip TDD. Each one has a documented response.

| Excuse | Reality |
|---|---|
| "It's a one-liner, too small to test." | One-liners break too. Writing the test takes 30 seconds and proves the line does what you claim. |
| "I'll add the test right after." | Tests written after code pass immediately. Passing immediately proves nothing — you never saw the test catch a real failure. |
| "I already manually tested it." | Manual ≠ systematic. No record, no re-run on next change, no proof of edge cases. Different category of evidence. |
| "TDD will slow me down on this hotfix." | TDD is faster than debugging the bug a second time when the fix regresses. Bug fixes are exactly when TDD pays off most. |
| "The behavior is too hard to test." | Hard to test = hard to use = poor design. Listen to the test. Use dependency injection or simplify the interface. |
| "This is just refactoring, no behavior change." | Then the existing tests should already cover it. If they don't, the refactor is uncovered — write tests for what you're about to touch first. |
| "Mocks would be a nightmare." | Code is too coupled. Either inject the dependency, or write an integration test against a real (in-memory) version. |
| "I need to explore the API shape first." | Fine — explore. Then **delete the exploration** and start with TDD. Keeping exploration code = testing-after with extra steps. |
| "User just wants this shipped." | User's instructions take priority over skills. If the user explicitly says "skip TDD this once," do so and note it in the handoff. Otherwise this is rationalization. |
| "There's no obvious place to put the test." | Mirror the source file: `foo.ts` → `foo.test.ts` next to it. If `foo.ts` has no test yet, this PR is the first. |

If you catch yourself thinking any of these without an explicit user override, **stop and run RED**.

---

### Skill: Verification Checklist (per change)

Before declaring a TDD-scoped change complete:

- [ ] Each new public function has at least one test.
- [ ] Watched each new test fail before implementing.
- [ ] Each test failed for the **expected** reason (feature missing), not a typo.
- [ ] Wrote minimal code to pass — no over-engineering.
- [ ] All tests pass (`npm test` exits 0).
- [ ] Output is clean — no warnings, no unhandled rejections.
- [ ] Edge cases (null, empty, error path, boundary) are covered.
- [ ] For bug fixes: the bug-reproduction test stays in the suite.

If any box is unchecked at handoff time, declare it explicitly and ask before proceeding.

---

### When TDD does NOT apply

- `*.tsx` (UI components) — covered by manual test sheet + UI/UX Critic.
- `*.config.ts`, `*.config.mjs`, `next.config.*`, `vitest.config.ts`.
- Generated code — `prisma/migrations/**`, `src/generated/**`.
- One-off scripts (`scripts/**`).
- Type-only changes (`*.d.ts`, type aliases, JSDoc tightening).
- Pure documentation (`docs/**`, `*.md`).

In these cases, the existing manual / build verification path is sufficient.
