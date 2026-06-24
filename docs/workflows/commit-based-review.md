# Commit-Based Code Review — Linkage + Critique in One Artifact

**Workflow Type:** `commit-based-review`
**Last Updated:** 2026-06-24 (Phase 1 — recipe authored, pilot pending)

## Stack Context

- Git history is the input; no scripts or deps required for the recipe itself.
- Output files live under `docs/reviews/<sha>-<slug>.md` — tracked in git so review history accumulates alongside code history.
- Pairs with two existing review streams (NOT a replacement for either):
  - `session-self-review.md` — semantic review of **chat transcripts** (Column 2 of ADR-0047). Lens: did the agent behave well during the session?
  - `setup-phase-end-review-gate.md` (`npm run review:phase`) — deterministic regression gate against OSS toolchain baselines (Column 1 of ADR-0047). Lens: did the commit break anything measurable?
- This recipe is Column 3: **did the commit itself embody the right approach, and is its rationale visible for posterity?** Lens: post-hoc critique of the diff, with full ADR/slice/Griller/decision traceability captured in one place.

## When this recipe applies

- A commit (or short atomic range) lands and is non-trivial: touches production code or schema, invokes an ADR, or made an architectural trade-off worth documenting.
- A session wraps with one-or-more commits worth reviewing — pair with the Handoff Architect Phase 4 step.
- Onboarding archaeology: someone (you, future-you, or a second contributor) needs to know "why is this code shaped this way" without paging through chat transcripts or memory shards.

This is **not** a per-commit ritual for trivial commits. Dependency bumps, typo fixes, doc-only edits, and pure mechanical refactors get a `Trivial: <reason>` short-circuit (template at bottom). The short-circuit is itself a useful artifact — it records "this was looked at and deliberately not reviewed in depth."

## Successful Sequence

1. **Identify the commit range to review.** Most common shapes:
   - **Single commit** post-ship: `git show <sha>` and `<sha>-<slug>.md`.
   - **Session range** (Handoff Architect call-site): `git log --oneline <session-start>..HEAD`, one review file per commit.
   - **ADR sweep**: all commits referenced by a freshly-shipped ADR — one review file per commit.

2. **Author the review file** at `docs/reviews/<short-sha>-<kebab-slug>.md` using the template below. Slug should be a 2–5 word summary of what the commit does (e.g. `b2d877c-context-userid-scoping.md`). Do **not** name the file after the ADR — many commits invoke multiple ADRs and one ADR spans many commits.

3. **Fill sections in order** — top-to-bottom is the same order a fresh reviewer reads them:
   1. **Diff summary** — what changed in this commit, in 2–4 sentences. Skim, don't re-narrate every hunk.
   2. **ADRs invoked / contradicted** — list the ADR IDs the commit either implements, extends, or violates. Cite the section. If the commit contradicts a still-Accepted ADR, that is a finding for section 6, not silently acceptable.
   3. **Context source(s)** — which slice manifest (`docs/c-yard/<slug>.json`), memory entity, or codegraph traversal informed the change. If Phase 0 was skipped, name what was skipped and why.
   4. **Griller questions raised (or skipped + why)** — the 3 Architectural Reviewer / The Griller questions that gated the implementation. If skipped (trivial commit, mechanical change, bug-fix-with-test-first), state `Skipped: <reason>`.
   5. **Decisions + alternatives considered** — the trade-off table. Even a one-line `Option A chosen over B because <why>` is enough; the goal is "future-me sees what was rejected and why."
   6. **Reviewer critique** — fresh-eyes pass. Done by an agent that did NOT participate in the originating session (subagent, second session, or human). Critique focuses on: missed approaches, leaky abstractions, test patterns that won't scale, hidden coupling, OWASP red flags, performance footguns. **Empty findings is a valid finding** — record "No issues surfaced on this pass" rather than omitting the section.

4. **Cross-link the file**:
   - Commit message footer for that commit's next reference (if amending — use a trailer like `Review: docs/reviews/<file>.md` — but do NOT amend already-pushed commits; just add the trailer to subsequent related commits).
   - Each invoked ADR's `Consequences` block (when promoting an ADR to Accepted or updating one): append `Review trail: docs/reviews/<file>.md` so the ADR ↔ commit linkage is two-way navigable.

5. **Commit the review file** as its own atomic commit:
   - Subject: `docs(review): <short-sha> — <slug>`.
   - Body: 2–3 lines summarising the critique outcome (clean / one finding / N findings). Commit the review file alone — do not bundle with code.

6. **Update workflow-reviews ledger** if this review was part of a session-wrap sweep — append to `docs/chat-exports/analysis/workflow-reviews.json` per the Handoff Architect cadence rule.

## Review file template

```markdown
# Review — <short-sha> — <human-readable title>

**Commit:** <full-sha>
**Reviewed:** <YYYY-MM-DD>
**Reviewer:** <agent name / "fresh session" / "human">
**Originating session:** <session-id or handoff doc path>

## 1. Diff summary

<2–4 sentences. What changed, where. Skim — do not re-narrate every hunk.>

## 2. ADRs invoked / contradicted

- **ADR-NNNN** — <how it's invoked: implements / extends / contradicts>. Section: <name>.
- ...

## 3. Context source(s)

- **Slice:** `docs/c-yard/<slug>.json` — entryPoints / knownTraps consulted: ...
- **Memory:** entities opened: `Entity1`, `Entity2`.
- **Codegraph:** `codegraph_context("<query>")` — surfaced ...
- **Phase 0 skipped:** <reason — only if truly skipped>

## 4. Griller questions raised (or skipped + why)

1. Q: <question 1>
   A: <answer that gated the impl>
2. Q: ...
3. Q: ...

OR

`Skipped: <reason>` (e.g. "Bug fix with regression test; no architectural surface to grill.")

## 5. Decisions + alternatives considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| <decision label> | <Option A> | <Option B, C> | <one-line reason> |

## 6. Reviewer critique

<Bullet-pointed findings. "No issues surfaced on this pass" is a valid finding — record it explicitly.>

- Finding 1: ...
- Finding 2: ...

OR

`No issues surfaced on this pass.`

## Cross-references

- Originating handoff: `docs/handoffs/<YYYY-MM-DD>_<HHmm>_handoff.md`
- Related reviews: `docs/reviews/<other-sha>-<slug>.md`
```

## Short-circuit template (trivial commits)

For dependency bumps, typo fixes, doc-only edits, mechanical renames, and pure formatting changes, drop the full template and use this:

```markdown
# Review — <short-sha> — <slug>

**Commit:** <full-sha>
**Reviewed:** <YYYY-MM-DD>
**Reviewer:** <agent / human>

**Trivial:** <reason — e.g. "Dependency bump, semver-compatible, vitest 1015/1015 unchanged.">

No further review needed.
```

The short-circuit is itself an audit trail entry — it records "this commit was looked at and deliberately not deep-reviewed."

## First-Attempt Failures

None yet — recipe authored 2026-06-24; populate after first pilot.

## Gotchas

- **Recency bias on self-review.** A reviewer who participated in the originating session will rationalize the implementer's choices. **Decouple by default**: spawn a subagent or open a fresh session for section 6. Sections 1–5 can be authored by the implementer or by the reviewer; section 6 should not be authored by anyone who held the keyboard during the commit.
- **Trivial-tax avoidance.** If you find yourself reaching for the `Trivial:` short-circuit on a commit that touches production logic, that is a signal to use the full template — not a license to skip. The short-circuit exists for deps/typo/doc commits only.
- **Don't amend pushed commits to add review trailers.** If you forgot the trailer, the review file is still findable by filename grep on the sha. Forcing amends rewrites history and breaks any sibling tooling that pinned to the original sha.
- **Two-way ADR linkage is one-shot per ADR transition.** When promoting an ADR to Accepted (or shipping a supersession), append the review-trail link once. Do NOT touch already-Accepted ADRs to backfill links — that violates the "ADR Author" rule against editing old ADRs.
- **Filename sha collision.** Git short-sha is 7 chars by default but `core.abbrev` can shorten it. Always use exactly 7 chars for review filenames so they sort lexicographically and don't collide as history grows. If a collision ever occurs at 7 chars, rename to 8 and don't re-litigate.
- **Reviewer should NOT run code or modify files.** Section 6 is read-only. If the reviewer finds something requiring code change, file it as a finding — do not silently fix it inside the review file's commit.

## Cross-references

- `docs/workflows/session-self-review.md` — Column 2 of the review pipeline (chat-transcript semantic review). Commit-based review is Column 3.
- `docs/workflows/setup-phase-end-review-gate.md` — Column 1 (deterministic OSS regression gate).
- `.github/instructions/persistence.instructions.md` — Handoff Architect at Phase 4 is the natural session-wrap call-site for triggering commit-based review on a session's commit range.
- `.github/instructions/logic.instructions.md` — The Griller / Architectural Reviewer skills produce the inputs for sections 4 and 5.
- [`docs/adr/0047-three-column-review-pipeline.md`](../adr/0047-three-column-review-pipeline.md) — the umbrella ADR establishing the three-column review pipeline. This recipe is Column 3.
