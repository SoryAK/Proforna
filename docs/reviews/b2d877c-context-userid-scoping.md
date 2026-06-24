# Review — b2d877c — context route userId scoping

**Commit:** `b2d877c2213723b1fbca100a38691b35597e2d6d`
**Reviewed:** 2026-06-24
**Reviewer:** subagent (Explore, thorough) for section 6; implementer for sections 1–5
**Originating session:** `docs/handoffs/2026-06-24_*_handoff.md` (pending — current session)

## 1. Diff summary

Closed a defense-in-depth gap in `src/app/api/ai/context/route.ts` where two recency-heuristic Prisma reads (`workHistory.findFirst` on `isActive` and `workLog.findFirst` on a 24h-recency window) were not scoping by `userId`. URL-override branches were already scoped; the parallel-fetch `Promise.all` block adjacent to them was not. Patch adds `userId` to the where-clauses of those two queries plus five other slice-building queries in the same block (`userProfile.findFirst`, `jobApplication.findMany`, `skill.findMany`, `careerGoal.findMany`, `certification.findMany`, `interview.findMany`) for consistency. Two new vitest regression tests assert `userId` is bound on the heuristic where-clauses. Trap entry in `docs/c-yard/ai-chat.json` flipped from a "PRE-EXISTING SECURITY GAP" warning to a positive "security invariant (patched 2026-06-24)" statement.

## 2. ADRs invoked / contradicted

- **ADR-0028** (`persona-contact-reverse-lookup`) — invoked. Strengthens the owner-scoping pattern the ADR established, extending it to ambient heuristic reads (a surface the ADR did not enumerate but the pattern explicitly generalises to).
- **ADR-0046 Phase A** (`ai-chat-context-awareness-and-rich-actions`) — extended. The ambient context route is a Phase A deliverable; this commit hardens its security invariant without changing the response contract. No contradiction.
- **ADR-0018** (`tdd-as-first-class-skill`) — invoked. Bug-fix-test-first: the two regression tests were written before the patch and would fail against the un-patched code.

## 3. Context source(s)

- **Slice:** `docs/c-yard/ai-chat.json` — `entryPoints` for the context route and `knownTraps.context-slices-and-ambient` (which already flagged this as "PRE-EXISTING SECURITY GAP" before the fix landed). The slice trap was the seed that turned this into a deliberate atomic commit.
- **Codegraph:** `codegraph_context("ai context route")` confirmed `src/app/api/ai/context/route.ts` as the sole route and located the parallel-fetch block.
- **Phase 0 skipped:** none — full lookup stack ran.

## 4. Griller questions raised (or skipped + why)

1. **Q:** Defense-in-depth or actual security boundary? If middleware always runs `getUserId()` and 401s on null, isn't the per-query filter belt-and-braces?
   **A:** Belt-and-braces today, but the per-query filter is the actual boundary the moment a future internal call-site (cron, server action, background job) bypasses the middleware. Cheap insurance.
2. **Q:** Why include the other five queries (`jobApplication`, `skill`, etc.) in the same patch if they already had `userId` scoping at the ADR-0028 layer?
   **A:** Visual consistency across the `Promise.all` block makes future "did you remember userId" code-review cheaper. Cost: zero net runtime change (they were already scoped through Prisma relations or generated types).
3. **Q:** Split commit or bundle with the SQL-ranking refactor (`c17c38f`)?
   **A:** Split. Security fix should be independently revertible without losing the unrelated rank refactor. Two atomic commits, two review files.

## 5. Decisions + alternatives considered

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Scope enforcement layer | Per-query `where: { userId }` | Schema-level RLS / Postgres policy | Per-query ships today; RLS needs migration + policy review + role-aware Prisma client. Filed as future ADR candidate. |
| Test mock shape | Hoisted `prismaMock` via `vi.hoisted()`, factory-mocked `@/lib/prisma` | Spy on `prisma.workHistory.findFirst` per test | Hoisted mock is the established pattern in this file (13 prior tests use it); switching styles mid-file would create two parallel test idioms. |
| Trap doc framing | Positive invariant statement (patched-2026-06-24) | Leave the original "GAP" note + add an "addressed by" footnote | Future-reader optimization: the slice should describe the current state, not the patch history. Patch history lives in git + this review file. |

## 6. Reviewer critique

- **Finding 1: URL-override queries lack explicit userId-scoping test assertions** — The new regression tests (lines 153–170) use `.toHaveBeenCalledWith(expect.objectContaining(...))` to explicitly verify that heuristic queries include `userId` in the WHERE clause. However, the existing URL-override tests ("overrides activeJob..." at line 343 and "falls back to the heuristic..." at line 401) only verify the **result** (that the correct entity is returned or fallback occurs) without asserting that the URL-override queries were called with `userId` in the WHERE clause. The test comment states "(userId-scoped lookup didn't match)" but relies on mock setup, not call verification. A future developer could accidentally remove `userId` from `prisma.workHistory.findFirst({ where: { id: activeJobIdParam } })` or the workLog equivalent, and these tests would still pass because the mock would return the expected value. To close this gap, add explicit `.toHaveBeenCalledWith()` assertions to the URL-override tests, mirroring the heuristic test pattern.

- **Finding 2: All Prisma queries in the route are userId-scoped (no gaps detected)** — Full audit of the route confirms all ten queries carry userId in their WHERE clauses: heuristic reads (workHistory, workLog), URL-override reads, and all seven slice-building queries (userProfile, jobApplication, skill, careerGoal, certification, interview). The stated coverage ("adds `userId` to heuristic lookups; all others already scoped") is accurate. No missed queries.

- **Finding 3: Regression test coverage is asymmetric across heuristic and URL-override** — The commit adds 13 → 15 tests, introducing two new explicit assertions on heuristic queries. However, the asymmetry (explicit for heuristic, implicit for URL-override) creates a durability risk. The heuristic tests would fail immediately if `userId` is removed; the URL-override tests would silently pass. Recommend either: (a) add explicit call-signature assertions to URL-override tests, or (b) create a separate regression suite for URL-override query arguments to maintain equal coverage rigor.

- **Finding 4: Defense-in-depth is appropriate; no unguarded code paths found** — The route correctly gates access: middleware auth → `getUserId()` null-check → per-query userId filtering. The per-query filter is belt-and-braces and would catch any middleware bypass. Verified that no code path reaches a Prisma query without `userId` being bound (non-null after the 401 gate).

- **Finding 5: No schema-level row-level security (RLS) constraints documented** — The slice manifest mentions "keep all future ambient lookups owner-scoped" but does not note whether Prisma has schema-level enforcement (e.g., `@db.db_generated` or a database-level RLS policy on workHistory/workLog tables). At-query filtering is sufficient for this fix, but a future ADR could explore schema-level constraints to make userId scoping unreachable at the schema layer.

**Summary:** No issues with the route implementation itself. Two findings (1 and 3) are about test coverage symmetry — actionable as a follow-up commit on `route.test.ts`. Findings 4 and 5 are positive confirmations / future-ADR seeds, not defects.

## Cross-references

- Sibling review: [c17c38f-mention-search-sql-rank.md](c17c38f-mention-search-sql-rank.md) — same session, same `/api/ai/**` area.
- Slice: [docs/c-yard/ai-chat.json](../c-yard/ai-chat.json) — `knownTraps.context-slices-and-ambient`.
- ADR: [docs/adr/0028-persona-contact-reverse-lookup.md](../adr/0028-persona-contact-reverse-lookup.md), [docs/adr/0046-ai-chat-context-awareness-and-rich-actions.md](../adr/0046-ai-chat-context-awareness-and-rich-actions.md).
- Recipe: [docs/workflows/commit-based-review.md](../workflows/commit-based-review.md).
