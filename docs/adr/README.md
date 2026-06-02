# Architecture Decision Records

This directory contains the **Architecture Decision Records (ADRs)** for Resumsify.

An ADR captures a single significant architectural or technical decision: the **context**, the **options considered**, the **decision made**, and the **consequences** of that choice. Once an ADR is accepted it is **immutable** — if the decision changes, write a new ADR that supersedes the old one.

## Format

We use the **[MADR](https://adr.github.io/madr/) (Markdown Any Decision Records)** template — see [template.md](./template.md).

## File Naming

```
NNNN-short-kebab-title.md
```

- `NNNN` is a zero-padded 4-digit sequence number (`0001`, `0002`, …)
- Title is lowercase, hyphenated, ~3–6 words

## Index

| #    | Title                                                                                | Status     | Date       |
| ---- | ------------------------------------------------------------------------------------ | ---------- | ---------- |
| 0001 | [Record architecture decisions](./0001-record-architecture-decisions.md)             | Accepted   | 2026-05-17 |
| 0002 | [Use Next.js 16 with Turbopack](./0002-nextjs-16-turbopack.md)                       | Accepted   | 2026-05-17 |
| 0003 | [Pin Prisma to v6 instead of v7](./0003-prisma-v6-over-v7.md)                        | Accepted   | 2026-05-17 |
| 0004 | [Adopt shadcn/ui v2 (base-ui) over Radix](./0004-shadcn-ui-v2-base-ui.md)            | Accepted   | 2026-05-17 |
| 0005 | [Use @googlemaps/js-api-loader v2 standalone API](./0005-google-maps-js-api-loader-v2.md) | Accepted   | 2026-05-17 |
| 0006 | [Job-map view-preset hot-swap pattern](./0006-job-map-view-preset-hot-swap.md)       | Accepted   | 2026-05-17 |
| 0007 | [Worklog notes three-pane redesign](./0007-worklog-notes-three-pane-redesign.md)     | Proposed   | 2026-05-18 |
| 0008 | [Worklog capture acceleration and draft persistence](./0008-worklog-capture-acceleration-and-draft-persistence.md) | Proposed   | 2026-05-18 |
| 0009 | [Worklog server-backed draft sync](./0009-worklog-server-backed-draft-sync.md) | Proposed   | 2026-05-18 |
| 0012 | [W2.1 DnD context placement and sortable tree strategy](./0012-w2.1-dnd-context-and-tree-strategy.md) | Proposed | 2026-05-25 |

## How to Add a New ADR

1. Copy [`template.md`](./template.md) to `NNNN-your-title.md` (use next sequence number)
2. Fill in Context, Drivers, Options, Decision, Consequences
3. Set Status to `Proposed` while opening a PR, `Accepted` once merged
4. Add a row to the Index above
5. If superseding an older ADR, set the old one's Status to `Superseded by [NNNN](./NNNN-...)` and link back

## When to Write an ADR

Write an ADR when a decision:

- Locks in a **major framework / library / paradigm** (e.g. ORM, UI library, auth strategy)
- Establishes a **pattern repeated across the codebase** (e.g. data-fetching convention)
- Reverses or constrains a **previous decision** (then it supersedes the old ADR)
- Affects **how multiple modules talk to each other**

Skip ADRs for routine implementation choices contained inside a single module.
