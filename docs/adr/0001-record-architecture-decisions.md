# 0001 — Record Architecture Decisions

- **Status:** Accepted
- **Date:** 2026-05-17
- **Deciders:** Sory Kaba
- **Tags:** meta, process

## Context and Problem Statement

Resumsify has accumulated a number of non-obvious technical decisions (framework versions, library swaps, structural patterns) whose *reasoning* lives only in memory, scratch chat logs, or commit messages. When the same questions resurface ("why aren't we on Prisma 7?", "why custom hot-swap instead of routing?"), there's no canonical answer, and we risk re-litigating decisions or accidentally undoing them.

We need a lightweight, source-controlled record of architectural decisions that:

- Lives next to the code
- Doesn't require external tooling
- Captures the *trade-offs*, not just the outcome
- Is cheap enough to write that we actually use it

## Decision Drivers

- Low friction — must be writable in under 15 minutes
- Discoverability — should sit in the repo, indexed
- Survivability — must outlive any single contributor's memory
- No vendor lock-in — plain Markdown, no proprietary tool

## Considered Options

- **Option A** — Adopt ADRs (this proposal), MADR template, `docs/adr/`
- **Option B** — Maintain a single `DECISIONS.md` running log
- **Option C** — Rely on commit messages and PR descriptions only
- **Option D** — Use an external tool (Notion, Confluence, GitHub Discussions)

## Decision Outcome

**Chosen option: "Adopt ADRs with MADR template in `docs/adr/`"**, because it gives one decision = one immutable file (easy to link, supersede, and grep), uses plain Markdown (no tooling lock-in), and the MADR structure forces us to write *why* and *what we rejected*, not just *what we picked*.

### Positive Consequences

- Every meaningful decision becomes searchable by topic and date
- Onboarding contributors can read `docs/adr/` to understand the "why" of the codebase
- Reversals are explicit (one ADR supersedes another) rather than silent

### Negative Consequences

- Small ongoing discipline cost — someone has to actually write the ADR
- The Index in `README.md` needs manual updating with each new ADR

## Pros and Cons of the Options

### Option A — ADRs in `docs/adr/` (MADR)

- ✅ Industry standard, well-understood
- ✅ Lives in the repo, no external service needed
- ✅ Immutable history of *why*
- ❌ Requires modest discipline to keep up

### Option B — Single running `DECISIONS.md`

- ✅ Zero structure to learn
- ❌ Becomes a monolith, hard to link to a specific decision
- ❌ Easy to silently edit/lose history

### Option C — Commit messages / PR descriptions only

- ✅ No extra files
- ❌ Buried, hard to discover
- ❌ Often missing or terse
- ❌ Squash-merging loses detail

### Option D — External tool (Notion etc.)

- ✅ Richer formatting, possible team comments
- ❌ Vendor lock-in
- ❌ Decoupled from the code it describes
- ❌ Search/permissions tied to the tool

## Links / References

- [MADR template](https://adr.github.io/madr/)
- [Michael Nygard's original ADR post](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
