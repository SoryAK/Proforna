# Commit Reviews

Per-commit critique + linkage artifacts produced by the `commit-based-review` workflow.

See [`docs/workflows/commit-based-review.md`](../workflows/commit-based-review.md) for the full recipe.

## File naming convention

```text
docs/reviews/<short-sha>-<kebab-slug>.md
```

- `<short-sha>` — exactly the first **7 characters** of the commit sha (matches `git log --oneline` default). Lexicographic sort lets the directory listing approximate chronological-ish order for small histories. If two reviews ever collide at 7 chars, the second is renamed to 8 and we move on — do not re-litigate already-named files.
- `<kebab-slug>` — 2–5 word description of what the commit does. Mirror the commit-message subject when reasonable, but the slug is for filesystem readability, NOT the commit message itself. Examples: `context-userid-scoping`, `mention-search-sql-rank`.

Do **not** name the file after the ADR — many commits invoke multiple ADRs and one ADR spans many commits.

## What lives in each review file

Two template shapes:

1. **Full template** — section 1 diff summary, section 2 ADRs invoked, section 3 context source, section 4 Griller questions, section 5 decisions + alternatives, section 6 reviewer critique. Use for any commit that touches production code/schema or invokes an architectural trade-off.
2. **Trivial short-circuit** — three lines + `Trivial: <reason>`. Use for dependency bumps, typo fixes, doc-only edits, mechanical renames, and pure formatting changes. Records "this commit was looked at and deliberately not deep-reviewed" — itself an audit-trail entry.

Both templates live in [`docs/workflows/commit-based-review.md`](../workflows/commit-based-review.md). Do not hand-roll a third shape — if neither template fits, the recipe needs updating, not the individual review file.

## Two-way linkage

- **Commit → review**: filename grep for the short sha finds the review. No commit-message trailer needed for past commits; future commits may carry `Review: docs/reviews/<file>.md` in a trailer.
- **ADR → review**: when an ADR is being promoted to `Accepted` or superseded, append `Review trail: docs/reviews/<file>.md` to its `Consequences` block in the same commit. Do NOT backfill links on already-Accepted ADRs — that violates the persistence-rule against editing old ADRs.

## Cross-references

- [`docs/workflows/commit-based-review.md`](../workflows/commit-based-review.md) — the recipe.
- [`docs/workflows/session-self-review.md`](../workflows/session-self-review.md) — sibling column 2 (chat-transcript semantic review).
- [`docs/workflows/setup-phase-end-review-gate.md`](../workflows/setup-phase-end-review-gate.md) — sibling column 1 (deterministic regression gate).
