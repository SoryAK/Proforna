# Review — c17c38f — mention-search SQL-side ranking

**Commit:** `c17c38f28067d50932df65ee7815e2717a71b6ca`
**Reviewed:** 2026-06-24
**Reviewer:** subagent (Explore, thorough) for section 6; implementer for sections 1–5
**Originating session:** `docs/handoffs/2026-06-24_*_handoff.md` (pending — current session)

## 1. Diff summary

Replaced the v1 two-step ranking pipeline in `src/app/api/ai/mention-search/route.ts` (fetch alphabetical-first-N from source table → re-sort in JS using `EntityAIMentionCount.findMany`) with a single `prisma.$queryRaw` per type using `Prisma.sql` templates. New query does a `LEFT JOIN "EntityAIMentionCount"` and applies `ORDER BY COALESCE(c.count, 0) DESC, c."lastMentionedAt" DESC NULLS LAST, <label> ASC` with `LIMIT` applied **after** the rank, fixing the v1 correctness bug where a high-rank entity sorted alphabetically outside the first-N was silently missed. All four type branches (job/skill/worklog/contact) refactored in parallel with per-type aliases (`w`, `s`, `w`, `cn`). All user-derived inputs (userId, wildcard search term, limit) ride as bound `Prisma.sql` parameters — no string interpolation, so the route is injection-safe. Test file refactored to mock `$queryRaw` only (instead of per-table `findMany` + count `findMany`), with two new structural assertions: `ORDER BY` shape and an explicit injection-safety test asserting raw user input never appears unwrapped in the captured SQL.

## 2. ADRs invoked / contradicted

- **ADR-0046 Phase C** (`ai-chat-context-awareness-and-rich-actions`) — extended. The ADR specifies the rank contract "count DESC, lastMentionedAt DESC, fall through to alphabetical when both zero." This commit keeps the contract bit-for-bit and only changes where it's enforced (SQL instead of JS). The ADR's mitigation note "purely additive; default rank without any rows is safe (everything ranks 0, falls through to alphabetical/recent)" still holds — the `COALESCE(c.count, 0)` and `NULLS LAST` in the new ORDER BY are the SQL-layer expression of that mitigation.
- **ADR-0028** (`persona-contact-reverse-lookup`) — invoked. Owner-scoping is preserved on both sides of the LEFT JOIN: `EntityAIMentionCount."userId" = ${userId}` in the JOIN condition AND `<Table>."userId" = ${userId}` in the WHERE.
- No ADR contradicted.

## 3. Context source(s)

- **Slice:** `docs/c-yard/ai-chat.json` — `knownTraps.mention-system` previously held the "v1 alphabetical-first-N caveat" which seeded this work. Trap text was rewritten in the same commit to describe the patched state.
- **Codegraph:** `codegraph_context("mention-search route")` confirmed `src/app/api/ai/mention-search/route.ts` as the sole owner and surfaced `EntityAIMentionCount` references for the schema lookup.
- **Schema:** `prisma/schema.prisma` consulted for `EntityAIMentionCount` shape (`@@index([userId, entityType])`) and the four source tables' column names.
- **Phase 0 skipped:** none.

## 4. Griller questions raised (or skipped + why)

1. **Q:** Per-type duplication — four near-identical SQL bodies in a single switch. Why not factor with a helper?
   **A:** `Prisma.raw(<table-name>)` is the only API that would let a helper accept a dynamic table identifier, and `Prisma.raw` accepts strings unfiltered — an injection footgun if a future caller passes user input. Inlining is the cost of staying on `Prisma.sql` (parameter-binding) for safety. Documented in the route header.
2. **Q:** Single UNION ALL across all four types vs. one query per type?
   **A:** The picker is type-scoped per request (user clicks "skill" tab, route receives `type: "skill"`). UNION would only pay off if the contract changed to mixed-type results. Out of scope for this commit; flagged for ADR-0046 Phase E if the picker UX shifts.
3. **Q:** Injection safety — are we 100% sure every user-derived value rides as a bound parameter?
   **A:** Yes, by construction: `Prisma.sql` template literals only accept bound parameters in `${}` slots; `Prisma.empty` is used for conditional fragments. A regression test was added that asserts the literal user input (`"react' OR 1=1 --"`) never appears in `lastQueryRawSql()` — the only safe-by-construction proof we can give in a hermetic test.

## 5. Decisions + alternatives considered

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| SQL builder | `Prisma.sql` template literals + `Prisma.empty` | `Prisma.raw` helper + dynamic table names | `Prisma.raw` accepts unfiltered strings — would push injection risk onto every call site. `Prisma.sql` binds all params. |
| Query shape | One `$queryRaw` per type | Single UNION ALL | Picker is type-scoped per request; UNION pays nothing today. Revisit if mixed-type picker lands. |
| Test strategy | Mock `$queryRaw` only; inspect bound params + SQL substrings | Use a real Postgres in test (testcontainer) | Hermetic test runs in <100ms; testcontainer adds ~5s startup. Saved for an integration-test ADR if needed. |
| Type safety on `$queryRaw` | Cast result as `RankedRow[]` via generic | Define a Zod schema and parse at the boundary | Cast matches the existing route's parse-once-trust pattern. Zod boundary is an option for an audit pass — see finding 3 below. |
| WorkLog `kind` filter location | Hard-coded in SQL (`AND w.kind = 'note'`) | Pass `kind` as a route parameter | The mention picker is contract-bound to notes (procedures/events are explicitly out of scope per ADR-0046). Parameterising now would invite a wider mention-target API the ADR has not sanctioned. |

## 6. Reviewer critique

- **Finding 1: Missing `userId` indexes on `WorkHistory` and `Contact` tables** — Both tables lack `@@index([userId])`. The query `LEFT JOIN EntityAIMentionCount ... WHERE <table>."userId" = $1` will full-table scan and filter by userId instead of using an index. This is a regression vs. the old in-memory sort (which only fetched N rows). For large tables, query latency will degrade significantly. The `EntityAIMentionCount` table has `@@index([userId, entityType])` but the source tables don't. Fix: add `@@index([userId])` to both `WorkHistory` and `Contact` models and run a migration.

- **Finding 2: LEFT JOIN structure validation missing from test suite** — Tests validate SQL string substrings (`/FROM "WorkHistory"/`) and parameter binding, but do not validate that `LEFT JOIN "EntityAIMentionCount"` is actually present in the query. A future refactor could accidentally remove the JOIN and the tests would still pass. The test should explicitly assert the JOIN clause is in the SQL string.

- **Finding 3: `$queryRaw<RankedRow[]>` generic type is not runtime-enforced** — Prisma's generic parameter tells TypeScript "I promise this returns RankedRow" but performs no runtime validation of column names or types. If a SELECT clause is accidentally changed (e.g., `w.company AS label` → `w.title AS label`), the code will silently return incorrect data without an error. Consider adding a runtime column-name validation helper or migrating to a raw query builder with built-in column typing.

- **Finding 4: WorkLog `kind='note'` filter hard-coded in SQL template** — The filter `w.kind = 'note'` is a string literal in the SQL, not a bound parameter. While safe (not user-supplied), it is non-extensible; if mention search should support procedures (`kind='procedure'`) in future, this SQL will require modification. Either document in the next ADR that kind expansion requires a route change, or parameterize `kind` now with a default.

- **Finding 5: Per-type SQL queries are serial rather than consolidated** — The route issues 4 separate `prisma.$queryRaw` calls (one per entity type). This is correct per ADR-0046 scope but results in 4 database round-trips for multi-type searches. A single UNION ALL query across all 4 types would be more efficient when the picker shows mixed results. Not a correctness issue but worth flagging for future performance review.

- **Finding 6: ADR-0046 ranking contract edge-case not tested** — ADR specifies "fall through to alphabetical when both [count and lastMentionedAt] zero." The SQL `NULLS LAST` ensures NULL counts don't break tie-breaking, but tests don't verify the actual query produces correct rank order for the all-zeros edge case. Current test mocks return pre-sorted data; consider adding an integration test that validates rank order against a real database with zero-mention entities.

**Summary:** One material finding (finding 1: missing source-table indexes — real latency regression risk). Three test-coverage findings (2, 3, 6) actionable as a follow-up commit. Two design-trade-off findings (4, 5) appropriately scoped as "out of this commit; flag for next ADR" — they match the implementer's own section-5 decisions.

## Cross-references

- Sibling review: [b2d877c-context-userid-scoping.md](b2d877c-context-userid-scoping.md) — same session, same `/api/ai/**` area.
- Slice: [docs/c-yard/ai-chat.json](../c-yard/ai-chat.json) — `knownTraps.mention-system`.
- ADR: [docs/adr/0046-ai-chat-context-awareness-and-rich-actions.md](../adr/0046-ai-chat-context-awareness-and-rich-actions.md) (Phase C), [docs/adr/0028-persona-contact-reverse-lookup.md](../adr/0028-persona-contact-reverse-lookup.md).
- Recipe: [docs/workflows/commit-based-review.md](../workflows/commit-based-review.md).
- **Follow-up candidates:**
  - Schema migration: add `@@index([userId])` to `WorkHistory` and `Contact` (finding 1).
  - Test hardening: assert `LEFT JOIN "EntityAIMentionCount"` substring + zero-mention rank order (findings 2, 6).
